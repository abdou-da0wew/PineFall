import { testUrl } from "./scripts/test-support.ts";
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
const page = await browser.newPage();
await page.goto(testUrl("?renderer=cpu"));
await page.waitForFunction(() => !!window.pinefallDiagnostics);
await page.evaluate(() => console.error("Diagnostic test", new Error("Test stack")));
await page.getByRole("region", { name: "Application errors" }).waitFor();
console.log(
  "Console capture:",
  await page
    .locator("#pinefall-diagnostics")
    .getByText("Diagnostic test", { exact: false })
    .count(),
);
await page.evaluate(() => {
  setTimeout(() => {
    throw new Error("Uncaught test");
  }, 0);
  Promise.reject(new Error("Promise test"));
});
await page.waitForTimeout(200);
console.log(
  "Uncaught:",
  await page
    .locator("#pinefall-diagnostics")
    .getByText("Uncaught exception", { exact: false })
    .count(),
);
console.log(
  "Promise:",
  await page
    .locator("#pinefall-diagnostics")
    .getByText("Unhandled promise rejection", { exact: false })
    .count(),
);
await expect(
  page.locator("#pinefall-diagnostics").getByText("Diagnostic test", { exact: false }),
).toBeVisible();
await expect(
  page.locator("#pinefall-diagnostics").getByText("Uncaught exception", { exact: false }),
).toBeVisible();
await expect(
  page.locator("#pinefall-diagnostics").getByText("Unhandled promise rejection", { exact: false }),
).toBeVisible();
await page
  .locator("#pinefall-diagnostics")
  .getByRole("button", { name: "Clear", exact: true })
  .click();
console.log(
  "Clear hides panel:",
  !(await page.getByRole("region", { name: "Application errors" }).isVisible()),
);
await expect(page.getByRole("region", { name: "Application errors" })).toBeHidden();
await browser.close();
