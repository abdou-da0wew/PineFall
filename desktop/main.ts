import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { GraphicsMode } from "./contracts";

app.setName("Pinefall");
const data = app.getPath("userData");
mkdirSync(data, { recursive: true });
const settingsPath = path.join(data, "graphics.json");
const bootMarker = path.join(data, "hardware-boot-pending");
const logPath = path.join(data, "desktop.log");
function log(message: string) {
  try {
    if (existsSync(logPath) && statSync(logPath).size > 65536) writeFileSync(logPath, "");
    appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  } catch {}
}
function savedMode(): GraphicsMode {
  try {
    const value: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (typeof value === "object" && value !== null && "mode" in value && value.mode === "hardware")
      return "hardware";
  } catch {}
  return "compatibility";
}
function saveMode(mode: GraphicsMode) {
  writeFileSync(settingsPath, JSON.stringify({ mode }, null, 2));
}
const recovering = existsSync(bootMarker);
const forcedSafe = process.argv.includes("--safe-mode");
const mode: GraphicsMode = forcedSafe || recovering ? "compatibility" : savedMode();
if (mode === "compatibility") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  if (recovering) {
    saveMode("compatibility");
    rmSync(bootMarker, { force: true });
  }
}
// Never disable Chromium's driver blocklist or enable unsafe WebGPU globally.
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
  if (next === mode) return;
  const response = await dialog.showMessageBox({
    type: "warning",
    title: "Restart Pinefall?",
    message: next === "hardware" ? "Try hardware acceleration?" : "Restart in Compatibility Mode?",
    detail:
      next === "hardware"
        ? "Old Radeon HD 6350/TeraScale drivers may not support current WebGL 2 or WebGPU. This mode is experimental and may glitch or crash. Chromium driver safeguards remain enabled. Restarting ends the current shift."
        : "This disables hardware acceleration and uses the CPU-compatible renderer. Restarting ends the current shift.",
    buttons: ["Cancel", "Restart"],
    defaultId: 0,
    cancelId: 0,
  });
  if (response.response !== 1) return;
  saveMode(next);
  rmSync(bootMarker, { force: true });
  app.relaunch({ args: process.argv.slice(1).filter((arg) => arg !== "--safe-mode") });
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
  if (mode === "hardware") {
    try {
      gpu = await app.getGPUInfo("basic");
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
    hardwareAcceleration: app.isHardwareAccelerationEnabled(),
    features: app.getGPUFeatureStatus(),
    gpu,
    metrics: app.getAppMetrics().map((p) => ({ type: p.type, cpu: p.cpu, memory: p.memory })),
    log: existsSync(logPath) ? readFileSync(logPath, "utf8") : "",
  };
  writeFileSync(result.filePath, JSON.stringify(payload, null, 2));
  return true;
}
async function recover(reason: string) {
  log(reason);
  if (recoveryDialog || !win) return;
  recoveryDialog = true;
  if (mode === "hardware") saveMode("compatibility");
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
        args: [...process.argv.slice(1).filter((a) => a !== "--safe-mode"), "--safe-mode"],
      });
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
      if (mode === "hardware") writeFileSync(bootMarker, "pending");
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
        }
      });
      ipcMain.handle("pinefall:graphics", async (event, next: unknown) => {
        if (!trusted(event)) throw new Error("Untrusted IPC sender");
        if (next !== "compatibility" && next !== "hardware") throw new Error("Invalid mode");
        await changeGraphics(next);
      });
      ipcMain.handle("pinefall:diagnostics", async (event) => {
        if (!trusted(event)) throw new Error("Untrusted IPC sender");
        return exportDiagnostics();
      });
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
            label: "Graphics",
            submenu: [
              {
                label: "Compatibility · recommended for old Radeon",
                type: "radio",
                checked: mode === "compatibility",
                click: () => void changeGraphics("compatibility"),
              },
              {
                label: "Hardware · experimental",
                type: "radio",
                checked: mode === "hardware",
                click: () => void changeGraphics("hardware"),
              },
              { type: "separator" },
              { label: "Export diagnostics…", click: () => void exportDiagnostics() },
            ],
          },
          { label: "View", submenu: [{ role: "togglefullscreen" }, { role: "toggleDevTools" }] },
        ]),
      );
      await win.loadFile(entry);
      win.show();
    })
    .catch((error) => {
      log(String(error));
      dialog.showErrorBox("Pinefall startup failed", String(error));
      app.quit();
    });
  app.on("child-process-gone", (_event, details) => {
    if (details.type === "GPU" && mode === "hardware")
      void recover(`GPU process exited: ${details.reason}`);
  });
  app.on("window-all-closed", () => app.quit());
}
