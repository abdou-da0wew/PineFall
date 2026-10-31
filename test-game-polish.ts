import { test, expect } from "bun:test";
import {
  sanitizeGraphics,
  DEFAULT_GRAPHICS,
  spatialCells,
  createSpatialIndex,
} from "./src/graphicsSettings";
import { decodeSave, conditionBonus, courierRank } from "./src/saveGame";
import { trees } from "./src/worldData";
test("Graphics settings reject invalid values and cap rendering cost", () => {
  expect(
    sanitizeGraphics({ drawDistance: 999, renderScale: 0, threshold: NaN, post: "yes" }),
  ).toEqual({ ...DEFAULT_GRAPHICS, drawDistance: 110, renderScale: 0.5 });
  expect(DEFAULT_GRAPHICS.post).toBe(false);
});
test("Forest cells preserve all trees and collision broadphase matches brute force", () => {
  const cells = spatialCells(trees, 18);
  expect(cells.flatMap((c) => c.items).length).toBe(trees.length);
  const index = createSpatialIndex(trees, 8);
  for (let i = 0; i < 600; i++) {
    const x = Math.sin(i * 17.2) * 54,
      z = Math.cos(i * 7.9) * 54;
    const hits = (t: (typeof trees)[number]) =>
      Math.abs(x - t.x) < 2 &&
      Math.abs(z - t.z) < 2 &&
      Math.hypot(x - t.x, z - t.z) < t.s * 0.6 + 1;
    expect(index.near(x, z, 3, hits)).toBe(trees.some(hits));
  }
});
test("Checkpoint validation restores progress but never movement or held keys", () => {
  const input = {
    version: 1,
    game: {
      x: 0,
      z: 34,
      angle: 0,
      health: 80,
      job: 1,
      credits: 200,
      deliveries: 1,
      dist: 100,
      time: 50,
      loaded: true,
      done: false,
      playing: true,
      speed: 99,
      keys: { w: true },
    },
  };
  const decoded = decodeSave(input);
  expect(decoded?.loaded).toBe(true);
  expect(decoded?.speed).toBe(0);
  expect(decoded?.playing).toBe(false);
  expect(decoded).not.toHaveProperty("keys");
  expect(decodeSave({ ...input, version: 2 })).toBeNull();
  expect(decodeSave({ ...input, game: { ...input.game, job: 1.5 } })).toBeNull();
  expect(decodeSave({ ...input, game: { ...input.game, x: Infinity } })).toBeNull();
});
test("Delivery progression rewards careful driving without rewarding damage", () => {
  expect(conditionBonus(100, 180)).toBe(27);
  expect(conditionBonus(60, 180)).toBe(0);
  expect(conditionBonus(1, 180)).toBe(0);
  expect(courierRank(3)).toBe("Valley regular");
  expect(courierRank(9)).toBe("Night keeper");
});
