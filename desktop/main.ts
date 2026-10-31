import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { Observability, clean } from "./observability";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Span, Fields } from "./observability";
import { pathToFileURL } from "node:url";
import type { GraphicsMode } from "./contracts";
import {
  isGraphicsMode,
  isLegacyOpenGL,
  graphicsSwitches,
  chooseGraphicsMode,
  restartArgs,
} from "./graphics";

app.setName("Pinefall");
const data = app.getPath("userData");
mkdirSync(data, { recursive: true });
const settingsPath = path.join(data, "graphics.json");
const bootMarker = path.join(data, "hardware-boot-pending");
const observations = new Observability(data);
const startup = observations.begin("app.startup");
let startupEnded = false;
function log(message: string) {
  observations.record("events", "app.message", { message }, startup);
}
process.on("uncaughtExceptionMonitor", (error) => {
  observations.record("errors", "main.uncaught_exception", { error: error.stack || error.message });
  void observations.flush();
});
function savedMode(): GraphicsMode {
  try {
    const value: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (
      typeof value === "object" &&
      value !== null &&
      "mode" in value &&
      isGraphicsMode(value.mode)
    )
      return value.mode;
  } catch {}
  return "compatibility";
}
function saveMode(mode: GraphicsMode, span?: Span) {
  writeFileSync(settingsPath, JSON.stringify({ mode }, null, 2));
  observations.record("audit", "graphics.preference_saved", { mode }, span);
}
const recovering = existsSync(bootMarker);
const mode = chooseGraphicsMode(savedMode(), process.argv, recovering);
if (mode === "compatibility") app.disableHardwareAcceleration();
const switches = graphicsSwitches(mode, process.platform);
for (const [name, value] of switches) {
  if (name === "disable-features") {
    const existing = app.commandLine.getSwitchValue(name);
    app.commandLine.appendSwitch(name, [existing, value].filter(Boolean).join(","));
  } else app.commandLine.appendSwitch(name, value);
}
if (recovering) {
  saveMode("compatibility");
  rmSync(bootMarker, { force: true });
}
// Sandbox and driver workarounds stay enabled. Only the explicit unblocked profile overrides the blocklist.
let win: BrowserWindow | null = null;
let recoveryDialog = false;
const entry = path.join(app.getAppPath(), "web", "index.html");
const entryUrl = pathToFileURL(entry).href;
function trusted(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return (
    !!win &&
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    event.senderFrame.url === entryUrl
  );
}
async function changeGraphics(next: GraphicsMode) {
  // Native radio items toggle before their click handler; restore the running state until restart.
  for (const item of Menu.getApplicationMenu()?.getMenuItemById("graphics-menu")?.submenu?.items ||
    []) {
    if (isGraphicsMode(item.id)) item.checked = item.id === mode;
  }
  if (next === mode) return;
  if (isLegacyOpenGL(next) && process.platform !== "linux")
    throw new Error("Linux-only graphics profile");
  const operation = observations.begin("graphics.change");
  observations.record("audit", "graphics.change_requested", { from: mode, to: next }, operation);
  const response = await dialog.showMessageBox({
    type: "warning",
    title: "Restart Pinefall?",
    message: next === "compatibility" ? "Restart in Compatibility Mode?" : `Try ${next}?`,
    detail:
      next === "compatibility"
        ? "Disable GPU acceleration and use CPU Canvas. Restarting ends the shift."
        : isLegacyOpenGL(next)
          ? "Use ANGLE OpenGL with X11/XWayland, disable Vulkan and accelerated video decode, and skip the WebGPU backend. X11 or XWayland must be installed and available. The GPU sandbox remains enabled. " +
            (next === "linux-opengl-unblocked"
              ? "WARNING: this profile bypasses Chromium’s GPU blocklist; driver crashes or corruption are possible. "
              : "The GPU blocklist remains enabled. ") +
            "Hardware use must be verified from the actual adapter shown in Renderer settings. Restarting ends the shift."
          : "Use Chromium’s default hardware backend and driver safeguards. Restarting ends the shift.",
    buttons: ["Cancel", "Restart"],
    defaultId: 0,
    cancelId: 0,
  });
  if (response.response !== 1) {
    observations.record("audit", "graphics.change_canceled", { requested: next }, operation);
    observations.end(operation, "canceled");
    return;
  }
  observations.record("audit", "graphics.change_confirmed", { from: mode, to: next }, operation);
  try {
    saveMode(next, operation);
  } catch (error) {
    observations.record("errors", "graphics.persist_failed", { error: String(error) }, operation);
    observations.end(operation, "error");
    throw error;
  }
  observations.end(operation);
  rmSync(bootMarker, { force: true });
  app.relaunch({ args: restartArgs(process.argv.slice(1)) });
  await observations.close();
  app.exit(0);
}
async function exportDiagnostics() {
  const result = await dialog.showSaveDialog({
    title: "Save Pinefall diagnostics",
    defaultPath: "pinefall-diagnostics.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return false;
  let gpu: unknown = "Not queried in Compatibility Mode to avoid initializing a graphics adapter.";
  if (mode !== "compatibility") {
    try {
      gpu = await app.getGPUInfo("complete");
    } catch (error) {
      gpu = String(error);
    }
  }
  const payload = {
    app: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
    mode,
    requestedSwitches: Object.fromEntries(switches),
    session: {
      type: process.env.XDG_SESSION_TYPE,
      display: process.env.DISPLAY,
      waylandDisplay: process.env.WAYLAND_DISPLAY,
      driPrime: process.env.DRI_PRIME,
    },
    hardwareAcceleration: app.isHardwareAccelerationEnabled(),
    features: app.getGPUFeatureStatus(),
    gpu,
    metrics: app.getAppMetrics().map((p) => ({ type: p.type, cpu: p.cpu, memory: p.memory })),
    observability: observations.status(),
  };
  writeFileSync(result.filePath, JSON.stringify(payload, null, 2));
  return true;
}
async function recover(reason: string) {
  observations.record("errors", "process.recovery", { reason });
  observations.alert("process_failure", true, { reason });
  log(reason);
  if (recoveryDialog || !win) return;
  recoveryDialog = true;
  if (mode !== "compatibility") saveMode("compatibility");
  try {
    const answer = await dialog.showMessageBox(win, {
      type: "warning",
      title: "Graphics recovery",
      message: "Pinefall stopped responding normally.",
      detail: `${reason}\nRestart in Compatibility Mode? This ends the current shift.`,
      buttons: ["Keep waiting", "Restart safely"],
      defaultId: 1,
      cancelId: 0,
    });
    if (answer.response === 1) {
      saveMode("compatibility");
      app.relaunch({
        args: [...restartArgs(process.argv.slice(1)), "--safe-mode"],
      });
      await observations.close();
      app.exit(0);
    }
  } finally {
    recoveryDialog = false;
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      log(
        `Starting ${app.getVersion()} in ${mode} mode${recovering ? " (recovered unfinished hardware boot)" : ""}`,
      );
      if (mode !== "compatibility") writeFileSync(bootMarker, "pending");
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",
            ],
          },
        }),
      );
      win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: "#172b2c",
        show: false,
        autoHideMenuBar: false,
        title: "Pinefall — Night Courier",
        webPreferences: {
          preload: path.join(app.getAppPath(), "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          backgroundThrottling: true,
          spellcheck: false,
          additionalArguments: [`--pinefall-graphics=${mode}`],
        },
      });
      win.webContents.on("will-navigate", (event, url) => {
        if (url !== entryUrl) event.preventDefault();
      });
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (url === "https://vgpu.sh/" || url === "https://vgpu.sh/docs")
          void shell.openExternal(url);
        return { action: "deny" };
      });
      win.webContents.on("will-attach-webview", (event) => event.preventDefault());
      win.webContents.on(
        "render-process-gone",
        (_event, details) =>
          void recover(`Renderer exited: ${details.reason} (${details.exitCode})`),
      );
      win.on("unresponsive", () => void recover("The application is unresponsive."));
      win.on("closed", () => {
        win = null;
      });
      ipcMain.on("pinefall:ready", (event) => {
        if (trusted(event)) {
          rmSync(bootMarker, { force: true });
          log("Renderer ready");
          if (!startupEnded) {
            startupEnded = true;
            observations.end(startup);
          }
          observations.record("events", "renderer.ready", { mode }, startup);
        }
      });
      ipcMain.handle("pinefall:graphics", async (event, next: unknown) => {
        if (!trusted(event)) throw new Error("Untrusted IPC sender");
        if (!isGraphicsMode(next)) throw new Error("Invalid mode");
        await changeGraphics(next);
      });
      ipcMain.handle("pinefall:diagnostics", async (event) => {
        if (!trusted(event)) throw new Error("Untrusted IPC sender");
        return observations.operation("diagnostics.export", async (span) => {
          const saved = await exportDiagnostics();
          observations.record("audit", "diagnostics.export", { saved }, span);
          return saved;
        });
      });
      let rateStart = Date.now(),
        rateCount = 0,
        rejected = 0;
      let lastFrame = 0,
        errorTimes: number[] = [],
        memoryHighSamples = 0;
      ipcMain.on("pinefall:telemetry", (event, kind: unknown, input: unknown) => {
        if (!trusted(event)) return;
        if (Date.now() - rateStart > 1000) {
          rateStart = Date.now();
          rateCount = 0;
        }
        if (++rateCount > 40) {
          rejected++;
          return;
        }
        if (
          !["error", "frames", "renderer", "action"].includes(String(kind)) ||
          typeof input !== "object" ||
          input === null
        )
          return;
        const fields: Fields = {};
        for (const key of [
          "source",
          "action",
          "message",
          "details",
          "renderer",
          "frames",
          "slowFrames",
          "elapsedMs",
          "fps",
          "meanFrameMs",
          "maxFrameMs",
        ]) {
          if (key in input) {
            const value = Reflect.get(input, key);
            if (typeof value === "string") fields[key] = value.slice(0, 4096);
            else if (
              typeof value === "number" &&
              Number.isFinite(value) &&
              value >= 0 &&
              value <= 1e9
            )
              fields[key] = value;
          }
        }
        if (kind === "frames") {
          if (
            typeof fields.frames !== "number" ||
            typeof fields.slowFrames !== "number" ||
            typeof fields.elapsedMs !== "number" ||
            fields.elapsedMs < 1000 ||
            fields.slowFrames > fields.frames
          )
            return;
          lastFrame = Date.now();
          observations.record("metrics", "renderer.frames", fields);
          observations.frames(fields.frames, fields.slowFrames, fields.elapsedMs);
        } else if (kind === "error") {
          errorTimes.push(Date.now());
          errorTimes = errorTimes.slice(-1000);
          observations.record("errors", "renderer.error", fields, startup);
        } else if (kind === "action") observations.record("audit", "ui.action", fields);
        else observations.record("events", "renderer.selected", fields, startup);
      });
      const eventLoop = monitorEventLoopDelay({ resolution: 20 });
      eventLoop.enable();
      let sampling = false;
      const sampler = setInterval(async () => {
        if (sampling) return;
        sampling = true;
        try {
          const processes = app.getAppMetrics();
          const groups = new Map<string, { memory: number; cpu: number; count: number }>();
          for (const process of processes) {
            const type = ["Browser", "Tab", "GPU", "Utility", "Zygote", "Sandbox helper"].includes(
              process.type,
            )
              ? process.type
              : "Other";
            const group = groups.get(type) || { memory: 0, cpu: 0, count: 0 };
            group.memory += process.memory.workingSetSize;
            group.cpu += process.cpu.percentCPUUsage;
            group.count++;
            groups.set(type, group);
          }
          for (const [type, group] of groups)
            observations.record("metrics", "process.by_type", {
              processType: type,
              workingSetSumMiB: group.memory / 1024,
              cpuPercentSum: group.cpu,
              processCount: group.count,
            });
          observations.record("metrics", "main.event_loop", {
            p95DelayMs: eventLoop.percentile(95) / 1e6,
            maxDelayMs: eventLoop.max / 1e6,
          });
          eventLoop.reset();
          let memoryKiB = 0,
            cpu = 0;
          for (const process of processes) {
            memoryKiB += process.memory.workingSetSize;
            cpu += process.cpu.percentCPUUsage;
          }
          errorTimes = errorTimes.filter((time) => Date.now() - time <= 60000);
          const memoryMiB = memoryKiB / 1024;
          memoryHighSamples = memoryMiB > 1024 ? memoryHighSamples + 1 : 0;
          const status = observations.status();
          observations.record("metrics", "process.sample", {
            workingSetSumMiB: memoryMiB,
            cpuPercentSum: cpu,
            processCount: processes.length,
            errorsLastMinute: errorTimes.length,
            ipcRejectedTotal: rejected,
            logDroppedTotal: status.dropped,
            logWriteFailures: status.writeFailures,
          });
          observations.alert("high_memory", memoryHighSamples >= 6, {
            workingSetSumMiB: memoryMiB,
            thresholdMiB: 1024,
          });
          observations.alert("error_burst", errorTimes.length >= 10, {
            errorsLastMinute: errorTimes.length,
          });
          observations.alert(
            "renderer_heartbeat_missing",
            !!win &&
              win.isVisible() &&
              !win.isMinimized() &&
              lastFrame > 0 &&
              Date.now() - lastFrame > 20000,
          );
          await observations.prometheus({
            pinefall_working_set_sum_bytes: memoryKiB * 1024,
            pinefall_cpu_percent_sum: cpu,
            pinefall_errors_last_minute: errorTimes.length,
            pinefall_log_dropped_total: status.dropped,
            pinefall_log_write_failures_total: status.writeFailures,
          });
        } catch (error) {
          observations.record("errors", "metrics.sample_failed", { error: String(error) });
        } finally {
          sampling = false;
        }
      }, 5000);
      sampler.unref();
      let quitting = false;
      app.on("before-quit", (event) => {
        if (quitting) return;
        quitting = true;
        event.preventDefault();
        clearInterval(sampler);
        eventLoop.disable();
        observations.record("events", "app.shutdown");
        const timeout = setTimeout(() => app.exit(0), 2000);
        void observations.close().finally(() => {
          clearTimeout(timeout);
          app.quit();
        });
      });
      ipcMain.handle("pinefall:observability-status", (event) => {
        if (!trusted(event)) throw new Error("Untrusted IPC sender");
        return observations.status();
      });
      ipcMain.handle("pinefall:open-logs", async (event) => {
        if (!trusted(event)) throw new Error("Untrusted IPC sender");
        observations.record("audit", "logs.folder_opened");
        await observations.flush();
        const error = await shell.openPath(observations.directory);
        if (error) throw new Error(error);
      });
      ipcMain.handle("pinefall:log-bundle", async (event) => {
        if (!trusted(event)) throw new Error("Untrusted IPC sender");
        return observations.operation("logs.export_bundle", async (span) => {
          const result = await dialog.showSaveDialog({
            title: "Export local diagnostic bundle",
            defaultPath: "pinefall-observability.json",
            filters: [{ name: "JSON", extensions: ["json"] }],
          });
          if (result.canceled || !result.filePath) {
            observations.record("audit", "logs.export_canceled", {}, span);
            return false;
          }
          observations.record("audit", "logs.export_confirmed", {}, span);
          const gpu =
            mode === "compatibility"
              ? "Not queried in CPU mode"
              : await observations
                  .operation("gpu.inspect", () => app.getGPUInfo("complete"), span)
                  .catch((error) => ({ error: clean(String(error)) }));
          const snapshot = await observations.snapshot();
          await writeFile(
            result.filePath,
            JSON.stringify(
              {
                ...snapshot,
                system: {
                  app: app.getVersion(),
                  electron: process.versions.electron,
                  chromium: process.versions.chrome,
                  platform: process.platform,
                  arch: process.arch,
                  mode,
                  switches: Object.fromEntries(switches),
                  features: app.getGPUFeatureStatus(),
                  gpu,
                },
                notes:
                  "Local bounded logs; best-effort redaction. Review before sharing. CPU/process memory is summed working set, not unique physical memory. Frame samples measure render callbacks, not GPU completion.",
              },
              null,
              2,
            ),
            { mode: 0o600 },
          );
          return true;
        });
      });
      observations.record(
        "events",
        "session.started",
        {
          app: app.getVersion(),
          electron: process.versions.electron,
          platform: process.platform,
          mode,
          recovering,
          requestedSwitches: JSON.stringify(switches),
        },
        startup,
      );
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Game",
            submenu: [
              { label: "Restart shift", click: () => win?.reload() },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          {
            id: "graphics-menu",
            label: "Graphics",
            submenu: [
              {
                id: "compatibility",
                label: "CPU Compatibility · recovery",
                type: "radio",
                checked: mode === "compatibility",
                click: () => void changeGraphics("compatibility"),
              },
              {
                id: "hardware",
                label: "Hardware · Chromium default",
                type: "radio",
                checked: mode === "hardware",
                click: () => void changeGraphics("hardware"),
              },
              { type: "separator" },
              ...(process.platform === "linux"
                ? [
                    {
                      id: "linux-opengl",
                      label: "Linux GPU · OpenGL / X11",
                      type: "radio" as const,
                      checked: mode === "linux-opengl",
                      click: () => void changeGraphics("linux-opengl"),
                    },
                    {
                      id: "linux-opengl-unblocked",
                      label: "Linux GPU · OpenGL / X11 · bypass blocklist",
                      type: "radio" as const,
                      checked: mode === "linux-opengl-unblocked",
                      click: () => void changeGraphics("linux-opengl-unblocked"),
                    },
                  ]
                : []),
              { label: "Export diagnostics…", click: () => void exportDiagnostics() },
            ],
          },
          { label: "View", submenu: [{ role: "togglefullscreen" }, { role: "toggleDevTools" }] },
        ]),
      );
      await observations.operation(
        "window.load",
        async () => {
          await win?.loadFile(entry);
        },
        startup,
      );
      win.show();
    })
    .catch((error) => {
      observations.record("errors", "startup.failed", { error: String(error) }, startup);
      observations.end(startup, "error");
      log(String(error));
      dialog.showErrorBox("Pinefall startup failed", String(error));
      app.quit();
    });
  app.on("child-process-gone", (_event, details) => {
    if (details.type === "GPU" && mode !== "compatibility")
      void recover(`GPU process exited: ${details.reason}`);
  });
  app.on("window-all-closed", () => app.quit());
}
