import { chromium, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectRoot } from "./scripts/test-support";
const profile = await mkdtemp(path.join(tmpdir(), "pinefall-package-"));
const executable =
  process.env.TEST_DESKTOP_EXECUTABLE ||
  path.join(projectRoot, "build/releases/linux-unpacked/pinefall");
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);
const child = Bun.spawn(
  [
    executable,
    ...(executable.endsWith(".AppImage") ? ["--appimage-extract-and-run"] : []),
    "--no-sandbox",
    "--remote-debugging-port=0",
  ],
  { env: { ...env, XDG_CONFIG_HOME: profile, APPDATA: profile }, stdout: "ignore", stderr: "pipe" },
);
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  const endpoint = await Promise.race([
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Packaged Electron did not start")), 30000);
    }),
    (async () => {
      const reader = child.stderr.getReader();
      let text = "";
      while (true) {
        const result = await reader.read();
        if (result.done) throw new Error(text);
        text += new TextDecoder().decode(result.value);
        const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          reader.releaseLock();
          return match[1];
        }
      }
    })(),
  ]);
  clearTimeout(timer);
  const browser = await chromium.connectOverCDP(endpoint);
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.waitForEvent("page"));
    await expect(page.getByText("2D COMPATIBILITY MODE")).toBeVisible();
    expect(await page.evaluate(() => window.pinefallDesktop?.runtime.mode)).toBe("compatibility");
    expect(await page.evaluate(() => Reflect.get(window, "require"))).toBeUndefined();
    await page.getByRole("button", { name: "START YOUR SHIFT" }).click();
    await page.keyboard.press("e");
    await expect(page.getByText("▣ Telescope lens")).toBeVisible();
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.inlineScriptRan=true";
      document.head.appendChild(script);
    });
    expect(await page.evaluate(() => Reflect.get(window, "inlineScriptRan"))).toBeUndefined();
    console.log(
      "Packaged Linux app: ASAR loading, preload, CPU mode, pickup, Node isolation and CSP PASS",
    );
  } finally {
    await browser.close();
  }
} finally {
  clearTimeout(timer);
  child.kill();
  await child.exited;
  await rm(profile, { recursive: true, force: true });
}
