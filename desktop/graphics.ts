import type { GraphicsMode } from "./contracts";
export const GRAPHICS_MODES: readonly GraphicsMode[] = [
  "compatibility",
  "hardware",
  "linux-opengl",
  "linux-opengl-unblocked",
];
export function isGraphicsMode(value: unknown): value is GraphicsMode {
  return typeof value === "string" && GRAPHICS_MODES.some((mode) => mode === value);
}
export function isLegacyOpenGL(mode: GraphicsMode) {
  return mode === "linux-opengl" || mode === "linux-opengl-unblocked";
}
export function graphicsSwitches(
  mode: GraphicsMode,
  platform: string,
): ReadonlyArray<readonly [string, string]> {
  if (mode === "compatibility")
    return [
      ["disable-gpu", ""],
      ["disable-gpu-compositing", ""],
    ];
  if (!isLegacyOpenGL(mode)) return [];
  if (platform !== "linux")
    throw new Error("The legacy OpenGL profiles require Linux. Use Hardware on Windows.");
  return [
    ["use-gl", "angle"],
    ["use-angle", "gl"],
    ["ozone-platform", "x11"],
    ["disable-features", "Vulkan"],
    ["disable-accelerated-video-decode", ""],
    ...(mode === "linux-opengl-unblocked" ? [["ignore-gpu-blocklist", ""] as const] : []),
  ];
}
export function chooseGraphicsMode(
  saved: GraphicsMode,
  args: readonly string[],
  recovering: boolean,
): GraphicsMode {
  if (recovering || args.includes("--safe-mode")) return "compatibility";
  const requested = args.find((arg) => arg.startsWith("--graphics="))?.slice("--graphics=".length);
  return isGraphicsMode(requested) ? requested : saved;
}
export function restartArgs(args: readonly string[]): string[] {
  return args.filter((arg) => arg !== "--safe-mode" && !arg.startsWith("--graphics="));
}

/** These switches must reach Chromium on the OS command line, not only app.commandLine. */
export function nativeProfileArgs(
  args: readonly string[],
  mode: GraphicsMode,
  platform: string,
): string[] {
  const managed = new Set([
    "use-gl",
    "use-angle",
    "ozone-platform",
    "disable-accelerated-video-decode",
    "ignore-gpu-blocklist",
    "disable-gpu",
    "disable-gpu-compositing",
    "pinefall-native-profile",
  ]);
  const retained = restartArgs(args).filter(
    (arg) => !managed.has(arg.replace(/^--/, "").split("=")[0]),
  );
  const disabled = retained
    .filter((arg) => arg.startsWith("--disable-features="))
    .flatMap((arg) => arg.slice("--disable-features=".length).split(","))
    .filter(Boolean);
  const native = graphicsSwitches(mode, platform)
    .filter(([name]) => name !== "disable-features")
    .map(([name, value]) => `--${name}${value ? "=" + value : ""}`);
  if (isLegacyOpenGL(mode)) {
    const withoutFeatures = retained.filter((arg) => !arg.startsWith("--disable-features="));
    return [
      ...withoutFeatures,
      `--graphics=${mode}`,
      `--pinefall-native-profile=${mode}`,
      ...native,
      `--disable-features=${[...new Set([...disabled, "Vulkan"])].join(",")}`,
    ];
  }
  return [...retained, `--graphics=${mode}`, ...native];
}
export function needsNativeProfile(
  mode: GraphicsMode,
  platform: string,
  args: readonly string[],
  gdkBackend: string | undefined,
): boolean {
  if (platform !== "linux" || !isLegacyOpenGL(mode)) return false;
  const values = new Map(
    args
      .filter((a) => a.startsWith("--"))
      .map((a) => {
        const i = a.indexOf("=");
        return i < 0 ? [a.slice(2), ""] : [a.slice(2, i), a.slice(i + 1)];
      }),
  );
  return (
    gdkBackend !== "x11" ||
    graphicsSwitches(mode, platform).some(([key, value]) =>
      key === "disable-features"
        ? !values.get(key)?.split(",").includes("Vulkan")
        : values.get(key) !== value,
    )
  );
}
