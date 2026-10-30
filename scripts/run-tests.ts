import { projectRoot } from "./test-support.ts";
import { errorMessage } from "../src/types.ts";

const suites: Record<string, string[]> = {
  cpu: ["test-compatibility.ts", "test-errors.ts", "test-vgpu-fallback.ts"],
  webgl: ["check.ts", "test-renderers.ts"],
  webgpu: ["test-vgpu-browser.ts", "test-vgpu-loss.ts"],
};
const suite = Bun.argv[2] || "cpu";
const scripts = suites[suite];
if (!scripts) throw new Error(`Unknown suite: ${suite}. Choose cpu, webgl, or webgpu.`);
let server: Bun.Subprocess<"ignore", "pipe", "inherit"> | undefined;
let current: Bun.Subprocess<"ignore", "inherit", "inherit"> | undefined;
const port = Bun.env.TEST_PORT || "4173";
const testEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(Bun.env)) {
  if (typeof value === "string") testEnv[key] = value;
}
const base = Bun.env.TEST_BASE_URL || `http://127.0.0.1:${port}`;
function stop() {
  current?.kill();
  server?.kill();
}
process.once("SIGINT", () => {
  stop();
  process.exit(130);
});
process.once("SIGTERM", () => {
  stop();
  process.exit(143);
});
try {
  if (!Bun.env.TEST_BASE_URL) {
    server = Bun.spawn(
      [
        process.execPath,
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        port,
        "--strictPort",
      ],
      {
        cwd: projectRoot,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "inherit",
      },
    );
    const stdout = server.stdout;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Test server startup timed out")), 15000);
      void (async () => {
        const reader = stdout.getReader();
        const decoder = new TextDecoder();
        let ready = false;
        let text = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text = (text + decoder.decode(value)).slice(-4096);
            if (!ready && text.includes("Local:")) {
              ready = true;
              clearTimeout(timeout);
              resolve();
            }
          }
          if (!ready) {
            clearTimeout(timeout);
            reject(new Error("Test server exited before becoming ready"));
          }
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        } finally {
          reader.releaseLock();
        }
      })();
    });
  }
  for (const script of scripts) {
    console.log(`\n→ ${script}`);
    current = Bun.spawn([process.execPath, script], {
      cwd: projectRoot,
      env: { ...testEnv, TEST_BASE_URL: base },
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
    const child = current;
    const timeout = setTimeout(() => child.kill(), 120000);
    const code = await child.exited;
    clearTimeout(timeout);
    current = undefined;
    if (code !== 0) throw new Error(`${script} failed (${code})`);
  }
  console.log(`\n✓ ${suite} suite passed`);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
} finally {
  stop();
  if (server) await server.exited;
}
