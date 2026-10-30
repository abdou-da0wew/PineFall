import { artifact, testUrl } from "./scripts/test-support.ts";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(testUrl(""));
await page.waitForTimeout(4500);
await page.screenshot({ path: artifact("title.png") });
await page.getByText("START YOUR SHIFT", { exact: false }).click();
await page.keyboard.press("e");
await page.waitForTimeout(1200);
console.log("cargo loaded", await page.getByText("▣ Telescope lens").count());
await page.keyboard.down("w");
await page.waitForTimeout(2200);
await page.keyboard.up("w");
await page.screenshot({ path: artifact("gameplay.png") });
console.log("errors", errors);
console.log("speed", await page.locator(".speed").innerText());
await page.keyboard.press("Escape");
console.log("pause", await page.getByText("Take a breather.").count());
await expect(page.getByText("▣ Telescope lens")).toBeVisible();
await expect(page.getByText("Take a breather.")).toBeVisible();
expect(errors).toEqual([]);
await browser.close();
