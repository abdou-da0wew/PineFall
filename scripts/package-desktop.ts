import { build, Platform, Arch } from "electron-builder";
import electron from "electron/package.json";
const target = Bun.argv[2] || "linux";
if (!["linux", "windows", "dir"].includes(target)) throw new Error("Choose linux, windows, or dir");
await build({
  targets:
    target === "windows"
      ? Platform.WINDOWS.createTarget(["zip"], Arch.x64)
      : Platform.LINUX.createTarget([target === "dir" ? "dir" : "AppImage"], Arch.x64),
  publish: "never",
  config: {
    appId: "com.pinefall.nightcourier",
    productName: "Pinefall",
    electronVersion: electron.version,
    asar: true,
    npmRebuild: false,
    buildDependenciesFromSource: false,
    directories: { app: "build/desktop-app", output: "build/releases" },
    files: ["main.cjs", "preload.cjs", "web/**/*", "package.json", "!node_modules/**/*"],
    compression: "normal",
    electronLanguages: ["en-US"],
    artifactName: "Pinefall-${version}-${os}-${arch}.${ext}",
    linux: {
      category: "Game",
      synopsis: "A quiet forest courier driving game",
      executableName: "pinefall",
    },
    win: { signAndEditExecutable: false },
    electronFuses: {
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
    },
  },
});
