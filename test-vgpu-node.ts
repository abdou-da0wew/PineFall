import { artifact, projectRoot } from "./scripts/test-support.ts";
import * as api from "vgpu/node";
import { resolveShader } from "@vgpu/wgsl/runtime";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { createWorld } from "./src/vgpu/createWorld.ts";
import { PNG } from "pngjs";
import fs from "node:fs";
const gpu = await api.init();
const errors: string[] = [];
gpu.onError((e) => errors.push(String(e)));
try {
  const shader = prepareShader(
    await resolveShader({ entry: projectRoot + "/src/vgpu/world.wgsl" }),
  );
  const target = api.target(gpu, { size: [720, 450], depth: true });
  const game = { x: 0, z: 34, angle: 0, speed: 0, job: 0, loaded: false, done: false, keys: {} };
  const world = createWorld(api, gpu, shader, game);
  world.update(game, 0, 1440, 900, 1 / 60);
  await world.prepare(target);
  api.frame(gpu, (f) => world.render(f, target));
  const pixels = await target.color.read({ mipLevel: 0, region: "all" });
  await gpu.settled();
  const png = new PNG({ width: 720, height: 450 });
  png.data.set(pixels);
  fs.writeFileSync(artifact("vgpu-node-scene.png"), PNG.sync.write(png));
  const colors = new Set();
  for (let i = 0; i < pixels.length; i += 4)
    colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  console.log("Rendered colors:", colors.size, "GPU errors:", errors);
  if (colors.size < 100 || errors.length) throw new Error("Pixel validation failed");
  fs.writeFileSync(
    artifact("vgpu-node-validation.json"),
    JSON.stringify({ colors: colors.size, errors, width: 720, height: 450, passed: true }, null, 2),
  );
  world.destroy();
} finally {
  gpu.dispose();
}
