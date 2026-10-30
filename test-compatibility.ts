import { artifact, testUrl } from "./scripts/test-support.ts";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { get: () => undefined }));
await page.goto(testUrl(""));
await page.getByText("2D COMPATIBILITY MODE").waitFor();
await page.getByRole("button", { name: "START YOUR SHIFT" }).click();
await page.keyboard.press("e");
await page.waitForTimeout(250);
console.log(
  "Automatic 2D fallback and parcel pickup:",
  await page.getByText("▣ Telescope lens").count(),
);
await expect(page.getByText("▣ Telescope lens")).toBeVisible();
await page.keyboard.down("w");
await page.waitForTimeout(2000);
await page.keyboard.up("w");
if (Number(await page.locator(".speed strong").innerText()) <= 0)
  throw new Error("Car did not accelerate");
console.log("Speed after driving:", await page.locator(".speed").innerText());
await page.keyboard.down(" ");
await page.waitForTimeout(1300);
await page.keyboard.up(" ");
await page.screenshot({ path: artifact("compatibility-test.png") });
await page.keyboard.press("Escape");
console.log("Pause:", await page.getByText("Take a breather.").count());
await expect(page.getByText("Take a breather.")).toBeVisible();
console.log("Runtime errors:", errors);
if (errors.length) process.exitCode = 1;
await browser.close();
