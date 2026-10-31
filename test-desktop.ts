import { _electron, expect } from "@playwright/test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { artifact, projectRoot } from "./scripts/test-support";
const profile = await mkdtemp(path.join(tmpdir(), "pinefall-desktop-"));
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);
const executablePath = path.join(
  projectRoot,
  "node_modules/electron/dist",
  (await Bun.file(path.join(projectRoot, "node_modules/electron/path.txt")).text()).trim(),
);
async function launch() {
  return _electron.launch({
    executablePath,
    args: [path.join(projectRoot, "build/desktop-app"), "--no-sandbox"],
    env: { ...env, XDG_CONFIG_HOME: profile, APPDATA: profile },
    timeout: 30000,
  });
}
try {
  const application = await launch();
  try {
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.getByText("2D COMPATIBILITY MODE")).toBeVisible();
    const state = await application.evaluate(({ app }) => ({
      accelerated: app.isHardwareAccelerationEnabled(),
      profile: app.getPath("userData"),
    }));
    expect(state.accelerated).toBe(false);
    expect(await page.evaluate(() => window.pinefallDesktop?.runtime.mode)).toBe("compatibility");
    expect(await page.evaluate(() => Reflect.get(window, "require"))).toBeUndefined();
    await page.getByRole("button", { name: "START YOUR SHIFT" }).click();
    await page.keyboard.press("e");
    await expect(page.getByText("▣ Telescope lens")).toBeVisible();
    await page.keyboard.down("w");
    await page.waitForTimeout(2000);
    await page.keyboard.up("w");
    expect(Number(await page.locator(".speed strong").innerText())).toBeGreaterThan(0);
    const cadence = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const context = canvas?.getContext("2d");
      if (!context) throw new Error("No CPU canvas");
      const original = context.fillRect;
      let frames = 0;
      const start = performance.now();
      context.fillRect = function (x, y, w, h) {
        if (x === 0 && y === 0) frames++;
        original.call(this, x, y, w, h);
      };
      await new Promise((resolve) => setTimeout(resolve, 3000));
      context.fillRect = original;
      return frames / ((performance.now() - start) / 1000);
    });
    expect(cadence).toBeGreaterThan(10);
    expect(cadence).toBeLessThan(35);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("HeapProfiler.collectGarbage");
    const initialHeap = await cdp.send("Runtime.getHeapUsage");
    for (let i = 0; i < 20; i++) await page.getByRole("button", { name: /PIXEL|CRISP/ }).click();
    await cdp.send("HeapProfiler.collectGarbage");
    const finalHeap = await cdp.send("Runtime.getHeapUsage");
    expect(finalHeap.usedSize - initialHeap.usedSize).toBeLessThan(20 * 1024 * 1024);
    console.log("Desktop 3-second cadence / 20 quality-toggle heap smoke test:", {
      fps: cadence,
      heapGrowthBytes: finalHeap.usedSize - initialHeap.usedSize,
    });
    await page.locator('button[title="Renderer settings"]').click();
    await page.getByRole("button", { name: /^R3F WebGL/ }).click();
    await expect(page.getByText(/Desktop Compatibility Mode disables GPU/)).toBeVisible();
    await page.getByRole("button", { name: /^vgpu · WebGPU/ }).click();
    await expect(page.getByText(/Desktop Compatibility Mode disables GPU/)).toBeVisible();
    await page.getByRole("button", { name: "BACK TO THE ROAD" }).click();
    const canvas = page.locator("canvas");
    const dimensions = await canvas.evaluate((element: HTMLCanvasElement) => ({
      width: element.width,
      height: element.height,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(960);
    expect(dimensions.height).toBeLessThanOrEqual(540);
    await page.screenshot({ path: artifact("desktop-compatibility.png") });
    await page.setViewportSize({ width: 3840, height: 2160 });
    const large = await canvas.evaluate((element: HTMLCanvasElement) => ({
      width: element.width,
      height: element.height,
    }));
    expect(large.width).toBeLessThanOrEqual(960);
    expect(large.height).toBeLessThanOrEqual(540);
    await page.setViewportSize({ width: 1280, height: 800 });
    // Real native export through a stubbed save dialog, not an arbitrary renderer file API.
    const output = artifact("desktop-diagnostics.json");
    await application.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, output);
    expect(await page.evaluate(() => window.pinefallDesktop?.exportDiagnostics())).toBe(true);
    expect((await Bun.file(output).json()).hardwareAcceleration).toBe(false);
    expect(errors).toEqual([]);
    console.log(
      "Electron: CPU default, no renderer Node globals, pickup/driving, GPU selection blocked, capped resize and native diagnostics PASS",
      dimensions,
    );
    // A previous failed hardware boot must recover before a GPU probe can run.
    await mkdir(state.profile, { recursive: true });
    await writeFile(
      path.join(state.profile, "graphics.json"),
      JSON.stringify({ mode: "hardware" }),
    );
    await writeFile(path.join(state.profile, "hardware-boot-pending"), "pending");
  } finally {
    await application.close();
  }
  const recovered = await launch();
  try {
    const page = await recovered.firstWindow();
    await expect(page.getByText("2D COMPATIBILITY MODE")).toBeVisible();
    expect(await recovered.evaluate(({ app }) => app.isHardwareAccelerationEnabled())).toBe(false);
    console.log("Electron: unfinished hardware boot recovery PASS");
  } finally {
    await recovered.close();
  }
} finally {
  await rm(profile, { recursive: true, force: true });
}
