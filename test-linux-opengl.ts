import { _electron, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { nativeProfileArgs } from "./desktop/graphics";
import type { GraphicsMode } from "./desktop/contracts";
import { projectRoot } from "./scripts/test-support";
const profile = await mkdtemp(path.join(tmpdir(), "pinefall-gl-"));
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);
try {
  for (const mode of ["linux-opengl", "linux-opengl-unblocked"] satisfies GraphicsMode[]) {
    const app = await _electron.launch({
      executablePath: path.join(projectRoot, "node_modules/electron/dist/electron"),
      args: nativeProfileArgs(
        [path.join(projectRoot, "build/desktop-app"), "--no-sandbox"],
        mode,
        "linux",
      ),
      env: { ...env, XDG_CONFIG_HOME: profile, GDK_BACKEND: "x11" },
      timeout: 20000,
    });
    try {
      const page = await app.firstWindow();
      await expect(
        page.getByRole("button", { name: /START YOUR SHIFT|CONTINUE SHIFT/ }),
      ).toBeVisible({
        timeout: 20000,
      });
      expect(await page.evaluate(() => window.pinefallDesktop?.runtime.mode)).toBe(mode);
      const switches = await app.evaluate(({ app }) => ({
        gl: app.commandLine.getSwitchValue("use-gl"),
        angle: app.commandLine.getSwitchValue("use-angle"),
        ozone: app.commandLine.getSwitchValue("ozone-platform"),
        blocklist: app.commandLine.hasSwitch("ignore-gpu-blocklist"),
        accelerated: app.isHardwareAccelerationEnabled(),
      }));
      expect(switches.gl).toBe("angle");
      expect(switches.angle).toBe("gl");
      expect(switches.ozone).toBe("x11");
      expect(switches.blocklist).toBe(mode.endsWith("unblocked"));
      await page.getByRole("button", { name: /START YOUR SHIFT|CONTINUE SHIFT/ }).click();
      await page.locator('button[title="Renderer settings"]').click();
      await page.getByRole("button", { name: /^vgpu · WebGPU/ }).click();
      await expect(page.getByText(/intentionally skips WebGPU/)).toBeVisible();
      console.log(
        mode,
        "launch flags and intentional WebGPU exclusion PASS; container result:",
        await page.locator(".compatibility-badge").innerText(),
      );
    } finally {
      await app.close();
    }
  }
} finally {
  await rm(profile, { recursive: true, force: true });
}
