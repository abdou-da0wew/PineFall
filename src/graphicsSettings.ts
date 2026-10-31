import { useSyncExternalStore } from "react";
export interface GraphicsSettings {
  culling: boolean;
  drawDistance: number;
  lodDistance: number;
  scenery: boolean;
  ambient: boolean;
  post: boolean;
  glow: boolean;
  threshold: number;
  strength: number;
  exposure: number;
  contrast: number;
  saturation: number;
  vignette: number;
  renderScale: number;
}
export const DEFAULT_GRAPHICS: GraphicsSettings = {
  culling: true,
  drawDistance: 70,
  lodDistance: 38,
  scenery: true,
  ambient: true,
  post: false,
  glow: false,
  threshold: 0.75,
  strength: 0.18,
  exposure: 1,
  contrast: 1,
  saturation: 1,
  vignette: 0.25,
  renderScale: 1,
};
export function sanitizeGraphics(value: unknown): GraphicsSettings {
  const result = { ...DEFAULT_GRAPHICS };
  if (!value || typeof value !== "object") return result;
  for (const key of ["culling", "scenery", "ambient", "post", "glow"] as const) {
    const v = Reflect.get(value, key);
    if (typeof v === "boolean") result[key] = v;
  }
  const ranges = {
    drawDistance: [35, 110],
    lodDistance: [20, 70],
    threshold: [0.05, 1],
    strength: [0, 0.6],
    exposure: [0.7, 1.4],
    contrast: [0.8, 1.3],
    saturation: [0, 1.5],
    vignette: [0, 0.8],
    renderScale: [0.5, 1],
  } as const;
  for (const key of Object.keys(ranges) as Array<keyof typeof ranges>) {
    const v = Reflect.get(value, key);
    if (typeof v === "number" && Number.isFinite(v))
      result[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], v));
  }
  return result;
}
function load() {
  try {
    return sanitizeGraphics(JSON.parse(localStorage.getItem("pinefall.graphics.v1") || "null"));
  } catch {
    return { ...DEFAULT_GRAPHICS };
  }
}
let state = load();
const listeners = new Set<() => void>();
export function getGraphics() {
  return state;
}
export function setGraphics(patch: Partial<GraphicsSettings>) {
  state = sanitizeGraphics({ ...state, ...patch });
  try {
    localStorage.setItem("pinefall.graphics.v1", JSON.stringify(state));
  } catch {}
  if (typeof window !== "undefined")
    window.pinefallDesktop?.telemetry("action", {
      action: "render.settings",
      message: JSON.stringify(state),
    });
  for (const listener of listeners) listener();
}
export function useGraphics() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getGraphics,
    getGraphics,
  );
}
export function spatialCells<T extends { x: number; z: number }>(
  items: readonly T[],
  size: number,
) {
  const cells = new Map<string, { x: number; z: number; items: T[] }>();
  for (const item of items) {
    const x = Math.floor(item.x / size),
      z = Math.floor(item.z / size),
      key = x + "," + z;
    let cell = cells.get(key);
    if (!cell) {
      cell = { x: (x + 0.5) * size, z: (z + 0.5) * size, items: [] };
      cells.set(key, cell);
    }
    cell.items.push(item);
  }
  return [...cells.values()];
}
export function createSpatialIndex<T extends { x: number; z: number }>(
  items: readonly T[],
  size: number,
) {
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const key = Math.floor(item.x / size) + "," + Math.floor(item.z / size);
    const bucket = cells.get(key) || [];
    bucket.push(item);
    cells.set(key, bucket);
  }
  return {
    near(x: number, z: number, radius: number, visit: (item: T) => boolean) {
      for (let ix = Math.floor((x - radius) / size); ix <= Math.floor((x + radius) / size); ix++)
        for (let iz = Math.floor((z - radius) / size); iz <= Math.floor((z + radius) / size); iz++)
          for (const item of cells.get(ix + "," + iz) || []) if (visit(item)) return true;
      return false;
    },
  };
}
