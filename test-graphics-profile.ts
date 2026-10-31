import { test, expect } from "bun:test";
import { chooseGraphicsMode, graphicsSwitches, restartArgs } from "./desktop/graphics";
test("Linux OpenGL explicitly selects ANGLE GL and X11, not Vulkan", () => {
  const switches = Object.fromEntries(graphicsSwitches("linux-opengl", "linux"));
  expect(switches["use-gl"]).toBe("angle");
  expect(switches["use-angle"]).toBe("gl");
  expect(switches["ozone-platform"]).toBe("x11");
  expect(switches["disable-features"]).toBe("Vulkan");
  expect(switches).not.toHaveProperty("ignore-gpu-blocklist");
  expect(switches).not.toHaveProperty("disable-gpu-sandbox");
  expect(switches).not.toHaveProperty("no-sandbox");
  expect(switches).not.toHaveProperty("disable-gpu");
});
test("Blocklist override is explicit and never disables the sandbox", () => {
  const switches = Object.fromEntries(graphicsSwitches("linux-opengl-unblocked", "linux"));
  expect(switches).toHaveProperty("ignore-gpu-blocklist");
  expect(switches).not.toHaveProperty("disable-gpu-sandbox");
});
test("Safe mode and failed startup override a forced hardware profile", () => {
  expect(chooseGraphicsMode("hardware", ["--graphics=linux-opengl", "--safe-mode"], false)).toBe(
    "compatibility",
  );
  expect(chooseGraphicsMode("hardware", ["--graphics=linux-opengl-unblocked"], true)).toBe(
    "compatibility",
  );
  expect(chooseGraphicsMode("compatibility", ["--graphics=linux-opengl"], false)).toBe(
    "linux-opengl",
  );
  expect(restartArgs(["app", "--graphics=linux-opengl", "--safe-mode", "--other"])).toEqual([
    "app",
    "--other",
  ]);
});
test("Linux profiles never silently apply to Windows", () => {
  expect(() => graphicsSwitches("linux-opengl", "win32")).toThrow();
  expect(graphicsSwitches("hardware", "win32")).toEqual([]);
});
