import { useEffect, useState } from "react";
import type { DesktopBridge } from "../desktop/contracts";
import { errorMessage } from "./types";
type Status = Awaited<ReturnType<DesktopBridge["observabilityStatus"]>>;
export default function ObservabilityPanel({ bridge }: { bridge: DesktopBridge }) {
  const [status, setStatus] = useState<Status | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void bridge
        .observabilityStatus()
        .then((value) => {
          if (!disposed) setStatus(value);
        })
        .catch((error) => {
          if (!disposed) setMessage(errorMessage(error));
        });
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [bridge]);
  async function action(exportBundle: boolean) {
    setBusy(true);
    try {
      if (exportBundle) {
        setMessage(
          (await bridge.exportLogBundle())
            ? "Diagnostic bundle saved. Review before sharing."
            : "Export canceled.",
        );
      } else {
        await bridge.openLogs();
        setMessage("Log folder opened.");
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="desktop-graphics" aria-label="Local observability">
      <div className="eyebrow">LOCAL DIAGNOSTICS / NO UPLOADS</div>
      <p>
        Structured event, error, audit, metric, trace and alert files. Metrics every five seconds;
        bounded queues and rotating logs. No server or cloud account.
      </p>
      {status && (
        <>
          <code className="desktop-flags">{status.directory}</code>
          <p>
            Session: {status.sessionId}
            <br />
            Queued: {status.queued} · Dropped: {status.dropped} · Write failures:{" "}
            {status.writeFailures}
          </p>
          <p role="status">
            {status.activeAlerts.length
              ? "Active alerts: " + status.activeAlerts.join(", ")
              : "No active local alerts."}
          </p>
        </>
      )}
      <div className="desktop-graphics-actions">
        <button disabled={busy} onClick={() => void action(false)}>
          OPEN LOG FOLDER
        </button>
        <button disabled={busy} onClick={() => void action(true)}>
          EXPORT DIAGNOSTIC BUNDLE
        </button>
      </div>
      <p role="status">{message}</p>
      <details className="renderer-details">
        <summary>Performance targets, privacy and limits</summary>
        <p>
          Local frame-pacing target: at least 95% of observed frame intervals ≤ 50 ms over five
          minutes of visible rendering. Samples measure render callbacks, not GPU completion. This
          is a diagnostic target, not an SLA.
        </p>
        <p>
          Alerts track sustained low FPS, frame-budget exhaustion, repeated errors, process
          failures, high summed working-set memory and missing renderer samples. Files may contain
          driver details and error text despite best-effort redaction. No keystrokes, credentials or
          user identifiers are intentionally collected. Audit files are not tamper-proof.
          Force-killing the app may lose queued records.
        </p>
      </details>
    </section>
  );
}
