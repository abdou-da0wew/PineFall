import type { Stop, Job, Tree, BuildingData, Vec2 } from "./types";
const STOPS: Stop[] = [
  { name: "Southbound depot", x: 0, z: 35, label: "DEPOT", color: "#e9c679" },
  { name: "Juniper observatory", x: -36, z: -32, label: "OBSERVATORY", color: "#a6e4cf" },
  { name: "Mosswood cabin", x: 36, z: -31, label: "MOSSWOOD", color: "#a6e4cf" },
  { name: "The old ranger station", x: 35, z: 34, label: "RANGER", color: "#a6e4cf" },
];
const JOBS: Job[] = [
  {
    to: 1,
    title: "A light in the dark",
    cargo: "Telescope lens",
    desc: "The observatory is waiting on a fragile delivery. Take the western road through the pines.",
    pay: 180,
  },
  {
    to: 2,
    title: "Across the quiet woods",
    cargo: "Medical supplies",
    desc: "Bring the medical kit to Mosswood cabin, on the eastern side of the forest.",
    pay: 240,
  },
  {
    to: 3,
    title: "One last lantern",
    cargo: "Radio batteries",
    desc: "The ranger station has gone quiet. Deliver fresh batteries before calling it a night.",
    pay: 320,
  },
];

const buildings: BuildingData[] = [
  { x: -30, z: -40, w: 10, d: 8, h: 5, c: "#617b82", roof: "#394b60", kind: "observatory" },
  { x: 43, z: -30, w: 9, d: 9, h: 4, c: "#987e64", roof: "#455e64", kind: "cabin" },
  { x: 43, z: 35, w: 9, d: 8, h: 4, c: "#83958a", roof: "#485f62", kind: "ranger" },
  { x: -8, z: 44, w: 12, d: 8, h: 4, c: "#6e8884", roof: "#45546b", kind: "depot" },
  { x: -20, z: 15, w: 9, d: 7, h: 3.5, c: "#7b8176", roof: "#614f59", kind: "cabin" },
  { x: 20, z: -16, w: 8, d: 7, h: 3, c: "#8b8072", roof: "#546371", kind: "cabin" },
];
let seed = 237;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const trees: Tree[] = [];
seed = 1234;
for (let i = 0; i < 76; i++) {
  const p = -57 + i * 1.52;
  for (let j = 0; j < 2; j++) {
    trees.push({ x: p + (rand() - 0.5), z: -57 - j * 3, s: 1 + rand() * 0.65 });
    trees.push({ x: p + (rand() - 0.5), z: 57 + j * 3, s: 1 + rand() * 0.65 });
    trees.push({ x: -57 - j * 3, z: p, s: 1 + rand() * 0.65 });
    trees.push({ x: 57 + j * 3, z: p, s: 1 + rand() * 0.65 });
  }
}
for (let i = 0; i < 235; i++) {
  let x = (rand() - 0.5) * 106,
    z = (rand() - 0.5) * 106;
  if (
    Math.abs(x) < 7 ||
    Math.abs(z) < 6 ||
    Math.abs(Math.abs(x) - 36) < 6 ||
    Math.abs(Math.abs(z) - 36) < 6
  )
    continue;
  if (buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 4 && Math.abs(z - b.z) < b.d / 2 + 4))
    continue;
  if (STOPS.some((s) => Math.hypot(s.x - x, s.z - z) < 8)) continue;
  trees.push({ x, z, s: 0.7 + rand() * 0.75 });
}
const rocks = Array.from({ length: 55 }, () => ({
  x: (rand() - 0.5) * 105,
  z: (rand() - 0.5) * 105,
  s: 0.35 + rand() * 0.6,
})).filter(
  (r) =>
    Math.abs(r.x) > 6 &&
    Math.abs(r.z) > 5 &&
    Math.abs(Math.abs(r.x) - 36) > 5 &&
    Math.abs(Math.abs(r.z) - 36) > 5,
);

const lamps: Vec2[] = [
  [-5, 29],
  [5, 4],
  [-5, -29],
  [-31, -5],
  [31, 5],
  [-41, 26],
  [41, -26],
  [29, 41],
  [-28, -41],
  [-41, -28],
  [41, 29],
  [26, -41],
];

export { STOPS, JOBS, buildings, trees, rocks, lamps, rand };
