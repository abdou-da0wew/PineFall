import manifest from "../package.json";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./test-support";
const destination = path.join(projectRoot, "build", "desktop-app");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const result = await Bun.build({
  entrypoints: [
    path.join(projectRoot, "desktop/main.ts"),
    path.join(projectRoot, "desktop/preload.ts"),
  ],
  outdir: destination,
  naming: "[name].cjs",
  target: "node",
  format: "cjs",
  external: ["electron"],
  minify: false,
});
if (!result.success) throw new AggregateError(result.logs, "Electron compilation failed");
await cp(path.join(projectRoot, "dist"), path.join(destination, "web"), { recursive: true });
await Bun.write(
  path.join(destination, "package.json"),
  JSON.stringify(
    {
      name: "pinefall-night-courier",
      productName: "Pinefall",
      version: manifest.version,
      description: "An atmospheric forest courier driving game",
      author: { name: "abdou-da0wew" },
      main: "main.cjs",
      private: true,
    },
    null,
    2,
  ),
);
console.log(
  "Desktop app staged in build/desktop-app (bundled web assets; no runtime node_modules).",
);
