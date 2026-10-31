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
function saveMode(mode: GraphicsMode) {
  writeFileSync(settingsPath, JSON.stringify({ mode }, null, 2));
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
  if (response.response !== 1) return;
  saveMode(next);
  rmSync(bootMarker, { force: true });
  app.relaunch({ args: restartArgs(process.argv.slice(1)) });
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
    log: existsSync(logPath) ? readFileSync(logPath, "utf8") : "",
  };
  writeFileSync(result.filePath, JSON.stringify(payload, null, 2));
  return true;
}
async function recover(reason: string) {
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
        }
      });
      ipcMain.handle("pinefall:graphics", async (event, next: unknown) => {
        if (!trusted(event)) throw new Error("Untrusted IPC sender");
        if (!isGraphicsMode(next)) throw new Error("Invalid mode");
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
      await win.loadFile(entry);
      win.show();
    })
    .catch((error) => {
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
