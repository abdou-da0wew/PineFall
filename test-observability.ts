import { test, expect, spyOn } from "bun:test";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Observability, clean } from "./desktop/observability";
test("JSONL categories, parent-child correlation, redaction and metrics snapshot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pinefall-obs-"));
  const obs = new Observability(root);
  try {
    const parent = obs.begin("request");
    await obs.operation(
      "step",
      async (span) => {
        obs.record(
          "audit",
          "setting.changed",
          { token: "secret-value", message: "token=abc person@example.org /home/alice/secret" },
          span,
        );
      },
      parent,
    );
    obs.end(parent);
    await obs.prometheus({ pinefall_memory_bytes: 1024, pinefall_log_dropped_total: 0 });
    const snapshot = await obs.snapshot();
    const audit = JSON.parse(snapshot.files["audit.jsonl"].trim());
    expect(audit.traceId).toBe(parent.traceId);
    expect(audit.spanId).not.toBe(parent.spanId);
    expect(audit.fields.token).toBe("[REDACTED]");
    expect(audit.fields.message).not.toContain("alice");
    expect(audit.fields.message).not.toContain("abc");
    expect(snapshot.files["traces.jsonl"]).toContain("parentSpanId");
    expect(snapshot.files["metrics.prom"]).toContain("# TYPE pinefall_log_dropped_total counter");
    expect(clean("Bearer abcDEF https://test.invalid/a?token=foo")).not.toContain("abcDEF");
  } finally {
    await obs.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("Queue bounded, rotation bounded, parseable files, disk failures observable", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pinefall-bounds-"));
  const obs = new Observability(root, 1024, 8);
  try {
    for (let n = 0; n < 100; n++) obs.record("events", "sample", { n });
    expect(obs.status().queued).toBe(8);
    expect(obs.status().dropped).toBe(92);
    await obs.flush();
    for (let round = 0; round < 4; round++) {
      for (let n = 0; n < 8; n++) obs.record("events", "sample", { n });
      await obs.flush();
    }
    const snapshot = await obs.snapshot();
    expect(Object.keys(snapshot.files).length).toBeLessThanOrEqual(3);
    for (const [name, text] of Object.entries(snapshot.files)) {
      expect((await stat(path.join(obs.directory, name))).size).toBeLessThanOrEqual(1024);
      for (const line of text.trim().split("\n")) expect(JSON.parse(line).schemaVersion).toBe(1);
    }
    const blocker = path.join(root, "not-a-directory");
    await writeFile(blocker, "x");
    const failing = new Observability(blocker);
    failing.record("errors", "failure");
    await failing.close();
    expect(failing.status().writeFailures).toBeGreaterThan(0);
  } finally {
    await obs.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("Local SLO alerts require sustained samples and transition instead of repeating", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pinefall-alert-"));
  const obs = new Observability(root);
  let now = 1000000;
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  try {
    obs.frames(50, 25, 5000);
    expect(obs.status().activeAlerts.length).toBe(0);
    for (let i = 0; i < 12; i++) {
      now += 5000;
      obs.frames(50, 25, 5000);
    }
    expect(obs.status().activeAlerts).toContain("sustained_low_fps");
    const snapshot = await obs.snapshot();
    expect(
      snapshot.files["alerts.jsonl"]
        .split("\n")
        .filter((line) => line.includes("sustained_low_fps")).length,
    ).toBe(1);
    now += 310000;
    obs.frames(150, 0, 5000);
    expect(obs.status().activeAlerts).not.toContain("sustained_low_fps");
  } finally {
    clock.mockRestore();
    await obs.close();
    await rm(root, { recursive: true, force: true });
  }
});
