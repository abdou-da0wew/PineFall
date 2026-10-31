import { expect } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { artifact, projectRoot } from "./scripts/test-support";
const profile = await mkdtemp(path.join(tmpdir(), "pinefall-native-bootstrap-"));
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);
delete env.GDK_BACKEND;
const executable =
  process.env.TEST_DESKTOP_EXECUTABLE ||
  path.join(projectRoot, "node_modules/electron/dist/electron");
const args = process.env.TEST_DESKTOP_EXECUTABLE
  ? ["--appimage-extract-and-run"]
  : [path.join(projectRoot, "build/desktop-app")];
const child = Bun.spawn([executable, ...args, "--graphics=linux-opengl", "--no-sandbox"], {
  env: { ...env, XDG_CONFIG_HOME: profile },
  stdout: "ignore",
  stderr: Bun.file(artifact("native-bootstrap-stderr.log")),
});
type Event = { event: string; sessionId: string; fields: Record<string, string | number> };
let relaunchedPid: number | undefined;
async function events(): Promise<Event[]> {
  try {
    return (await readFile(path.join(profile, "Pinefall/observability/events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
try {
  await expect
    .poll(
      async () => {
        const rows = await events();
        const session = rows.find((row) => row.event === "session.started");
        if (typeof session?.fields.processId === "number") relaunchedPid = session.fields.processId;
        return rows.some((row) => row.event === "renderer.ready");
      },
      { timeout: 30000 },
    )
    .toBe(true);
  const rows = await events();
  expect(rows.filter((row) => row.event === "native_profile.relaunch").length).toBe(1);
  const session = rows.find((row) => row.event === "session.started");
  expect(session?.fields.nativeOzoneArgument).toBe("--ozone-platform=x11");
  expect(session?.fields.gdkBackend).toBe("x11");
  expect(session?.fields.mode).toBe("linux-opengl");
  expect(await child.exited).toBe(0);
  console.log(
    "Automatic fresh-process restart: one bootstrap, native X11 argument, GDK X11 environment and renderer ready PASS",
  );
} catch (error) {
  console.error(await Bun.file(artifact("native-bootstrap-stderr.log")).text());
  console.error(await events());
  throw error;
} finally {
  child.kill();
  if (relaunchedPid) {
    try {
      process.kill(relaunchedPid, "SIGTERM");
    } catch {}
  }
  await rm(profile, { recursive: true, force: true });
}
