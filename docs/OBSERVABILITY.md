# Pinefall local observability

This is a desktop-only, offline implementation of the useful observability concepts. It does **not** install Loki, Grafana, Prometheus, OpenTelemetry SDKs, Jaeger, Alertmanager, PagerDuty or Datadog. No HTTP listener, collector service, account, remote dashboard or upload is started. The application is still Electron with its existing local game assets.

## Get the evidence

In-game **Renderer → Graphics Lab → Local diagnostics**:

- **Open log folder** opens the actual per-user location in your file manager.
- **Export diagnostic bundle** saves one JSON file containing retained categorized JSONL files, the latest Prometheus text snapshot, session/writer status, Electron/Chromium versions, selected graphics profile and switches, GPU feature status and (outside CPU mode) GPU information.
- The panel displays the current session ID, active local alerts, queue size, dropped records and write failures. It refreshes while the panel is open.
- **Export GPU diagnostics** remains available separately for a smaller adapter/configuration snapshot.

The folder is `observability/` beneath Electron's `userData` directory (normally `~/.config/Pinefall/observability` on Linux, `%APPDATA%/Pinefall/observability` on Windows). Overrides can change this; the displayed path is authoritative.

Reproduce the issue, note the time and chosen profile, then export the bundle. Review it before sharing. Don't post credentials or raw unrelated system logs. Older retained sessions are included, identified by session ID. The export operation's own completion span is written **after** the snapshot it exports, so it is present in the subsequent on-disk log, not necessarily in that bundle.

## Files

Files appear when their category first receives an event. Each JSONL line is a complete JSON object; no multiline stack traces break line parsing.

| File            | Contents                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events.jsonl`  | Session/startup, renderer readiness/selection, reported adapter identity, operation starts, shutdown                                                      |
| `errors.jsonl`  | Renderer diagnostics (console errors, uncaught exceptions/rejections, backend failures), main exception monitor, process failures, failed operations      |
| `audit.jsonl`   | Graphics change requested/confirmed/canceled/saved, quality changes, Graphics Lab access, game notices, diagnostic-export actions, opening the log folder |
| `metrics.jsonl` | Renderer frame samples, process CPU/memory summaries and fixed process-type groups, main event-loop delay, writer health, rolling frame-pacing SLI        |
| `traces.jsonl`  | Completed timed spans with IDs, optional parent span, status and duration                                                                                 |
| `alerts.jsonl`  | Local alert firing/resolution transitions, not repeated messages every sample                                                                             |
| `metrics.prom`  | Latest aggregate native-process metrics in Prometheus text format, atomically replaced; **not** a time-series database or scrape endpoint                 |

UTC timestamps use ISO 8601. Common fields: `schemaVersion`, `time`, `monotonicMs`, `sequence`, `sessionId`, `category`, `event`, `severity`, optional `traceId`/`spanId`, and sanitized `fields`. Monotonic timestamps/durations are local to the main process. Sequence gaps can indicate dropped records; category separation itself also produces gaps.

Every record has a random per-launch session ID, not a user ID. Operations have 32-hex trace IDs and 16-hex span IDs. Startup/window-load and bundle-export/GPU-inspection spans have parent-child relationships. Graphics changes record the confirmation outcome; errors include operation context where instrumented. Renderer startup/error records carry the startup trace context. Unrelated events/metrics correlate by session and time; not every event has an operation trace. This is a small custom local tracing format, **not OTLP or a Jaeger-native file**. There are no fictitious HTTP requests, services or database spans.

Audit records are ordinary local files, **not tamper-proof or compliance-grade**. The system records instrumented events, not every instruction, keyboard input or individual frame.

## Metrics and meaning

Renderer samples are aggregated for approximately five seconds before IPC: callback FPS, mean/max inter-frame time, frame count and frames slower than 50 ms. No per-frame log writes or IPC. Hidden documents reset their frame samples. CPU Canvas records completed drawing callbacks; R3F records frame callbacks; WebGPU records draw submission callbacks. These do **not** measure GPU completion, scanout, input-to-photon latency or compositor drops. Camera/world/quality changes and host scheduling can affect them.

Every five seconds the main process samples Electron process metrics: process count, summed reported CPU usage, summed working set, and the same values grouped into a small fixed set of process types. Summed working set can double-count shared memory and is **not unique physical RAM or VRAM**. OS-specific Electron metric semantics still apply. Event-loop delay is sampled at 20 ms resolution and reports interval p95/max in milliseconds. It is scheduler/event-loop delay, not GPU rendering time; its baseline includes the sampling resolution.

`metrics.prom` uses fixed metric names and **no user/session/trace/PID labels**. Counters reset on application restart. Session IDs, operation IDs, adapter strings and error messages belong in the logs/traces, not metric labels. Metrics JSONL has a bounded set of event types and fixed process groups, not one series per user or object.

## Local alerts and diagnostic SLO

These are local UI/file alerts only. No emails, desktop push notification, pages or incident-management service are configured.

- `sustained_low_fps`: all recent samples below 24 callback FPS; at least ten samples spanning at least 45 seconds in the last 60 seconds.
- `frame_pacing_budget_exhausted`: after the same warmup, rolling frame-pacing good-frame ratio falls below 95%.
- `error_burst`: at least ten accepted renderer error reports within a minute.
- `high_memory`: summed working set exceeds 1 GiB for six consecutive native samples (approximately 30 seconds). This is a diagnostic heuristic, not proof of a leak.
- `renderer_heartbeat_missing`: a previously reporting renderer has not sent a frame sample for 20 seconds while its native window is visible and not minimized.
- `process_failure`: a renderer/GPU failure or unresponsive recovery event is observed; stays active for that process session, cleared by restart.

Frame-pacing SLI: observed intervals ≤ 50 ms / all observed intervals, using up to 60 recent samples within five minutes. Target: ≥ 95%. The recorded remaining budget ratio is `1 - badFrameRatio / 0.05`; a negative number means the diagnostic budget is exceeded. Partial windows are reported with sample/frame counts. This is not an uptime calculation, multi-window service burn-rate policy, customer SLA or guarantee of smooth presentation. Alerts can be affected by CPU load, window visibility and diagnostics overhead. Thresholds are currently fixed in code, not adjustable in-game.

## Resource limits and persistence

- Six JSONL streams, each with a 2 MiB current file and two rotated backups (`.1`, `.2`): approximately **36 MiB maximum retained JSONL**, plus small metrics snapshot. Old data is overwritten by size, not retained for a guaranteed number of days.
- A bounded pending queue of 512 records plus at most one in-flight batch. Overload drops new records and increments the displayed dropped count; no unbounded disk-write promise chain.
- Fields/string sizes are limited. Long records may be summarized/truncated; accepted renderer messages are rate-limited to 40 per second per window, with a rejected count in native metric samples.
- Batched asynchronous writes approximately once a second. JSONL rotation is bounded; metrics text uses temporary-file rename. No synchronous per-frame logging.
- Normal quit attempts to flush, with a two-second shutdown deadline. A kill, OS crash, power failure or blocked disk can lose pending data; this is not fsync-backed durable transaction logging. Incomplete startup spans can be useful evidence, but aren't proof of a specific driver fault.
- Disk failures increment writer-health status rather than recursively logging to the failed writer. The UI exposes failures/drops; exporting cannot recreate missing evidence. Cross-file snapshot capture is best effort, not an atomic filesystem transaction.
- Normal file writes request owner-only permissions (`0700` directory, `0600` files); actual enforcement depends on the OS/filesystem, and pre-existing directory permissions are not reset. Large explicit bundle exports can briefly use additional memory/CPU.

## Privacy and redaction

The application intentionally does not collect keystrokes, passwords, user identifiers, network traffic or screenshots. String sanitization limits length and masks common bearer tokens, `token/password/secret/api_key` assignments, email addresses, common home-directory prefixes and HTTP query strings. Sensitive named fields are replaced entirely. No telemetry leaves the machine automatically.

This is **best effort**, not a security boundary or guarantee that every secret format is recognized. Error/driver text, paths, GPU/system metadata and the bundle's displayed log directory can still identify aspects of a machine. Review an export before sharing. Untrusted third-party console text can be stored as sanitized text, not interpreted as instructions or HTML.

## Validation

```sh
bun run test:observability
bun run desktop:prepare
xvfb-run -a bun run test:desktop
```

Unit tests cover trace relationships, redaction, valid JSONL, bounded queue/rotation, disk-failure accounting and alert warmup/transitions. The Electron UI test injects controlled renderer diagnostics, observes a local alert, exports via the in-game button and checks all six categories plus the Prometheus text snapshot. Existing graphics-profile/recovery tests remain. This is not a long-duration performance certification, physical CEDAR test or Windows runtime test.
