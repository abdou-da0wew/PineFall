import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, GraphicsMode } from "./contracts";
import { isGraphicsMode } from "./graphics";
const requested = process.argv.find((arg) => arg.startsWith("--pinefall-graphics="))?.split("=")[1];
const mode: GraphicsMode = isGraphicsMode(requested) ? requested : "compatibility";
const bridge: DesktopBridge = {
  runtime: Object.freeze({
    mode,
    platform: process.platform,
    version: "1.0.0",
    targetFps: 30,
    maxRenderWidth: 960,
    maxRenderHeight: 540,
  }),
  ready: () => ipcRenderer.send("pinefall:ready"),
  setGraphicsMode: async (mode: GraphicsMode) => {
    if (!isGraphicsMode(mode)) throw new Error("Invalid graphics mode");
    await ipcRenderer.invoke("pinefall:graphics", mode);
  },
  exportDiagnostics: () => ipcRenderer.invoke("pinefall:diagnostics"),
};
contextBridge.exposeInMainWorld("pinefallDesktop", Object.freeze(bridge));
