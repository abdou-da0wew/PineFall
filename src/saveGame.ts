import type { GameSnapshot, GameState } from "./types";
const key = "pinefall.courier.v1";
export function decodeSave(value: unknown): GameSnapshot | null {
  if (!value || typeof value !== "object" || Reflect.get(value, "version") !== 1) return null;
  const s: unknown = Reflect.get(value, "game");
  if (!s || typeof s !== "object") return null;
  const num = (name: string, min: number, max: number) => {
    const v = Reflect.get(s, name);
    return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
  };
  const x = num("x", -53.5, 53.5),
    z = num("z", -53.5, 53.5),
    angle = num("angle", -1e6, 1e6),
    health = num("health", 1, 100),
    job = num("job", 0, 2),
    credits = num("credits", 0, 1e9),
    deliveries = num("deliveries", 0, 1e6),
    dist = num("dist", 0, 1e12),
    time = num("time", 0, 1e12);
  const loaded = Reflect.get(s, "loaded"),
    done = Reflect.get(s, "done");
  if (
    x === null ||
    z === null ||
    angle === null ||
    health === null ||
    job === null ||
    !Number.isInteger(job) ||
    credits === null ||
    deliveries === null ||
    dist === null ||
    time === null ||
    typeof loaded !== "boolean" ||
    typeof done !== "boolean" ||
    (done && loaded)
  )
    return null;
  return {
    x,
    z,
    angle,
    health,
    job,
    credits,
    deliveries,
    dist,
    time,
    loaded,
    done,
    playing: false,
    paused: false,
    speed: 0,
    steer: 0,
    hit: 0,
    boost: 100,
  };
}
export function loadGame(): GameSnapshot | null {
  try {
    return decodeSave(JSON.parse(localStorage.getItem(key) || "null"));
  } catch {
    return null;
  }
}
export function saveGame(game: GameState): boolean {
  try {
    const { keys: _keys, ...snapshot } = game;
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), game: snapshot }),
    );
    return true;
  } catch {
    return false;
  }
}
export function courierRank(deliveries: number) {
  return deliveries >= 9 ? "Night keeper" : deliveries >= 3 ? "Valley regular" : "New courier";
}
export function conditionBonus(health: number, pay: number) {
  return Math.round((pay * 0.15 * Math.max(0, Math.min(100, health) - 60)) / 40);
}
