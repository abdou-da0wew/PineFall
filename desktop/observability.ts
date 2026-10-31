import {
  mkdir,
  appendFile,
  rename,
  rm,
  stat,
  readFile,
  writeFile,
  readdir,
} from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
export type Stream = "events" | "errors" | "audit" | "metrics" | "traces" | "alerts";
export type Fields = Record<string, string | number | boolean | null>;
export const streams: readonly Stream[] = [
  "events",
  "errors",
  "audit",
  "metrics",
  "traces",
  "alerts",
];
export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  start: number;
  startedAt: string;
}
export function clean(text: string): string {
  return text
    .slice(0, 4096)
    .replace(/(bearer\s+)[\w.-]+/gi, "$1[REDACTED]")
    .replace(
      /((?:password|token|secret|authorization|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\/home\/[^/\s]+|\/Users\/[^/\s]+|[A-Z]:\\Users\\[^\\\s]+/gi, "[HOME]")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, "$1[QUERY_REDACTED]");
}
export class Observability {
  readonly sessionId = randomUUID();
  readonly directory: string;
  private queue: Array<{ stream: Stream; line: string }> = [];
  private task: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setInterval>;
  private flushing = false;
  private dropped = 0;
  private failures = 0;
  private seq = 0;
  private sizes = new Map<Stream, number>();
  private activeAlerts = new Set<string>();
  private windows: Array<{ at: number; frames: number; slow: number; fps: number }> = [];
  constructor(
    root: string,
    private maxBytes = 2 * 1024 * 1024,
    private maxQueue = 512,
  ) {
    this.directory = path.join(root, "observability");
    this.timer = setInterval(() => void this.flush(), 1000);
    this.timer.unref();
  }
  record(stream: Stream, event: string, fields: Fields = {}, span?: Span) {
    if (this.queue.length >= this.maxQueue) {
      this.dropped++;
      return;
    }
    const safe: Fields = {};
    for (const [key, value] of Object.entries(fields).slice(0, 32))
      safe[key.slice(0, 64)] = /password|token|secret|authorization|api[_-]?key/i.test(key)
        ? "[REDACTED]"
        : typeof value === "string"
          ? clean(value)
          : typeof value === "number" && !Number.isFinite(value)
            ? null
            : value;
    if (JSON.stringify(safe).length > 12000) {
      const summary = JSON.stringify(safe).slice(0, 8000);
      for (const key of Object.keys(safe)) delete safe[key];
      safe.truncated = true;
      safe.summary = summary;
    }
    this.queue.push({
      stream,
      line:
        JSON.stringify({
          schemaVersion: 1,
          time: new Date().toISOString(),
          monotonicMs: performance.now(),
          sequence: ++this.seq,
          sessionId: this.sessionId,
          category: stream,
          event,
          severity: stream === "errors" ? "error" : stream === "alerts" ? "warning" : "info",
          traceId: span?.traceId,
          spanId: span?.spanId,
          ...{ fields: safe },
        }) + "\n",
    });
  }
  begin(name: string, parent?: Span): Span {
    const span = {
      name,
      traceId: parent?.traceId || randomBytes(16).toString("hex"),
      spanId: randomBytes(8).toString("hex"),
      parentSpanId: parent?.spanId,
      start: performance.now(),
      startedAt: new Date().toISOString(),
    };
    this.record("events", "operation.started", { operation: name }, span);
    return span;
  }
  end(span: Span, status = "ok", fields: Fields = {}) {
    this.record(
      "traces",
      span.name,
      {
        ...fields,
        status,
        startedAt: span.startedAt,
        durationMs: performance.now() - span.start,
        parentSpanId: span.parentSpanId || null,
      },
      span,
    );
  }
  async operation<T>(name: string, fn: (span: Span) => Promise<T>, parent?: Span): Promise<T> {
    const span = this.begin(name, parent);
    try {
      const result = await fn(span);
      this.end(span);
      return result;
    } catch (error) {
      this.record("errors", "operation.failed", { operation: name, error: String(error) }, span);
      this.end(span, "error");
      throw error;
    }
  }
  alert(name: string, firing: boolean, fields: Fields = {}) {
    if (firing === this.activeAlerts.has(name)) return;
    if (firing) this.activeAlerts.add(name);
    else this.activeAlerts.delete(name);
    this.record("alerts", name, { ...fields, state: firing ? "firing" : "resolved" });
  }
  frames(frames: number, slow: number, elapsedMs: number) {
    const now = Date.now();
    this.windows.push({ at: now, frames, slow, fps: (frames * 1000) / elapsedMs });
    this.windows = this.windows.filter((w) => now - w.at <= 300000).slice(-60);
    const total = this.windows.reduce((sum, w) => sum + w.frames, 0);
    const bad = this.windows.reduce((sum, w) => sum + w.slow, 0);
    const sli = total ? 1 - bad / total : 1;
    const recent = this.windows.filter((w) => now - w.at <= 60000);
    const warmed = recent.length >= 10 && recent[recent.length - 1].at - recent[0].at >= 45000;
    const sustained = warmed && recent.every((w) => w.fps < 24);
    this.record("metrics", "slo.frame_pacing", {
      windowSeconds: 300,
      activeSamples: this.windows.length,
      observedFrames: total,
      goodFrameRatio: sli,
      target: 0.95,
      errorBudgetRemainingRatio: 1 - (1 - sli) / 0.05,
    });
    this.alert("sustained_low_fps", sustained, { thresholdFps: 24, windowSeconds: 60 });
    this.alert("frame_pacing_budget_exhausted", warmed && sli < 0.95, {
      goodFrameRatio: sli,
      target: 0.95,
    });
  }
  status() {
    return {
      sessionId: this.sessionId,
      directory: this.directory,
      queued: this.queue.length,
      dropped: this.dropped,
      writeFailures: this.failures,
      activeAlerts: [...this.activeAlerts],
    };
  }
  flush(): Promise<void> {
    if (this.flushing || !this.queue.length) return this.task;
    this.flushing = true;
    const batch = this.queue;
    this.queue = [];
    this.task = this.task
      .then(async () => {
        try {
          await mkdir(this.directory, { recursive: true, mode: 0o700 });
          for (const stream of streams) {
            const lines = batch.filter((item) => item.stream === stream).map((item) => item.line);
            if (!lines.length) continue;
            const file = path.join(this.directory, stream + ".jsonl");
            let size =
              this.sizes.get(stream) ??
              (await stat(file)
                .then((s) => s.size)
                .catch(() => 0));
            let pending = "";
            for (const line of lines) {
              const bytes = Buffer.byteLength(line);
              if (bytes > this.maxBytes) {
                this.dropped++;
                continue;
              }
              if (size + bytes > this.maxBytes) {
                if (pending) {
                  await appendFile(file, pending, { mode: 0o600 });
                  pending = "";
                }
                await rm(file + ".2", { force: true });
                await rename(file + ".1", file + ".2").catch((error) => {
                  if (error.code !== "ENOENT") throw error;
                });
                await rename(file, file + ".1").catch((error) => {
                  if (error.code !== "ENOENT") throw error;
                });
                size = 0;
              }
              pending += line;
              size += bytes;
            }
            if (pending) await appendFile(file, pending, { mode: 0o600 });
            this.sizes.set(stream, size);
          }
        } catch {
          this.failures++;
          this.dropped += batch.length;
        }
      })
      .finally(() => {
        this.flushing = false;
      });
    return this.task;
  }
  async snapshot() {
    await this.flush();
    await this.flush();
    const files: Record<string, string> = {};
    try {
      for (const name of await readdir(this.directory)) {
        if (
          /^(events|errors|audit|metrics|traces|alerts)\.jsonl(?:\.[12])?$/.test(name) ||
          name === "metrics.prom"
        )
          files[name] = await readFile(path.join(this.directory, name), "utf8");
      }
    } catch {
      this.failures++;
    }
    return { schemaVersion: 1, createdAt: new Date().toISOString(), status: this.status(), files };
  }
  async prometheus(values: Record<string, number>) {
    try {
      await this.flush();
      const lines = Object.entries(values)
        .filter(([key, value]) => /^pinefall_[a-z_]+$/.test(key) && Number.isFinite(value))
        .map(
          ([key, value]) =>
            `# TYPE ${key} ${key.endsWith("_total") ? "counter" : "gauge"}\n${key} ${value}\n`,
        )
        .join("");
      await writeFile(path.join(this.directory, "metrics.prom.tmp"), lines, { mode: 0o600 });
      await rename(
        path.join(this.directory, "metrics.prom.tmp"),
        path.join(this.directory, "metrics.prom"),
      );
    } catch {
      this.failures++;
    }
  }
  async close() {
    clearInterval(this.timer);
    await this.flush();
    await this.flush();
  }
}
