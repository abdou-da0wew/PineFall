import path from "node:path";
const electron = path.resolve(
  "node_modules/electron/dist",
  (await Bun.file("node_modules/electron/path.txt").text()).trim(),
);
const child = Bun.spawn([electron, "build/desktop-app", ...Bun.argv.slice(2)], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
process.exitCode = await child.exited;
