import { testUrl } from "./scripts/test-support.ts";
import { chromium, expect } from "@playwright/test";
for (const software of [false, true]) {
  const browser = await chromium.launch({
    headless: true,
    args: software
      ? ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : ["--no-sandbox", "--disable-webgl"],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Isolate WebGL probing; WebGPU fallback is covered by its own suite.
  if (!software) {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "gpu", { get: () => undefined }),
    );
  }
  await page.goto(testUrl(""));
  await page.getByRole("button", { name: "START YOUR SHIFT" }).waitFor();
  await page.waitForTimeout(1200);
  console.log(
    software ? "SOFTWARE WEBGL" : "NO WEBGL",
    await page.locator(".compatibility-badge").innerText(),
  );
  await page.locator('button[title="Renderer settings"]').click();
  await page.getByRole("button", { name: /^R3F WebGL/ }).click();
  console.log("Adapter", await page.locator(".renderer-status").innerText());
  console.log("Retry", await page.locator(".renderer-note").innerText());
  await page.getByRole("button", { name: "CPU Canvas RELIABLE FALLBACK", exact: false }).click();
  await page.getByRole("button", { name: "BACK TO THE ROAD", exact: false }).click();
  await page.getByRole("button", { name: "START YOUR SHIFT" }).click();
  await page.keyboard.press("e");
  await page.waitForTimeout(200);
  console.log("CPU pickup", await page.getByText("▣ Telescope lens").count(), "Errors", errors);
  await expect(page.getByText("▣ Telescope lens")).toBeVisible();
  expect(errors).toEqual([]);
  await browser.close();
}
