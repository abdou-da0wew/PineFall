import { chromium, expect } from "@playwright/test";
import { artifact, testUrl } from "./scripts/test-support";
for (const gpu of [false, true]) {
  const browser = await chromium.launch({
    headless: true,
    args: gpu
      ? ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : ["--no-sandbox", "--disable-webgl"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "gpu", { get: () => undefined }),
    );
    await page.goto(testUrl());
    await page.getByRole("button", { name: "START YOUR SHIFT" }).click();
    await page.keyboard.press("e");
    await expect(page.getByText("▣ Telescope lens")).toBeVisible();
    await page.locator('button[title="Renderer settings"]').click();
    const panel = page.getByRole("region", { name: "Performance and effects" });
    await expect(panel.getByLabel("Enable post-processing")).not.toBeChecked();
    const originalWidth = await page
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.width);
    await panel.getByRole("slider", { name: "Render resolution scale" }).fill("0.5");
    await expect
      .poll(() => page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.width))
      .toBeLessThan(originalWidth);
    await panel.getByRole("slider", { name: "Render resolution scale" }).fill("1");

    await panel.getByLabel("Enable post-processing").check();
    if (gpu) {
      await panel.getByLabel("Light glow (WebGL only)", { exact: true }).check();
      await panel.getByLabel("Glow luminance threshold").fill("0.5");
      await panel.getByLabel("Glow intensity").fill("0.4");
    } else
      await expect(panel.getByLabel("Light glow (WebGL only)", { exact: true })).toBeDisabled();
    await panel.getByLabel("Exposure", { exact: true }).fill("1.2");
    await page.getByRole("button", { name: "BACK TO THE ROAD", exact: false }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: artifact(gpu ? "polish-webgl-effects.png" : "polish-canvas-world.png"),
    });
    await page.locator('button[title="Renderer settings"]').click();
    for (let i = 0; i < 4; i++) {
      await panel.getByLabel("Enable post-processing").uncheck();
      await panel.getByLabel("Enable post-processing").check();
    }
    await panel.getByLabel("Distance culling (Canvas / WebGL)").uncheck();
    await panel.getByLabel("Distance culling (Canvas / WebGL)").check();
    await panel.getByRole("button", { name: "PERFORMANCE PRESET" }).click();
    await page.getByRole("button", { name: "BACK TO THE ROAD", exact: false }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "SAVE CHECKPOINT", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "CONTINUE SHIFT" }).click();
    await expect(page.getByText("▣ Telescope lens")).toBeVisible();
    if (!gpu) {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "SAVE & RETURN TO TITLE" }).click();
      await page.evaluate(() => {
        const value = JSON.parse(localStorage.getItem("pinefall.courier.v1") || "{}");
        value.game.x = -36;
        value.game.z = -32;
        value.game.health = 100;
        localStorage.setItem("pinefall.courier.v1", JSON.stringify(value));
      });
      await page.reload();
      await page.getByRole("button", { name: "CONTINUE SHIFT" }).click();
      await page.keyboard.press("e");
      await expect(page.getByText(/Delivery complete\. \+207 credits/)).toBeVisible();
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("pinefall.courier.v1") || "{}"),
      );
      expect(saved.game.deliveries).toBe(1);
      expect(saved.game.job).toBe(1);
      expect(saved.game.loaded).toBe(false);
    }
    expect(errors).toEqual([]);
    console.log(
      gpu ? "WebGL" : "Canvas",
      "live effects, culling controls, save/reload, gameplay PASS",
    );
  } finally {
    await browser.close();
  }
}
