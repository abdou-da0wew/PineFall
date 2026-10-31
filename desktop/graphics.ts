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
