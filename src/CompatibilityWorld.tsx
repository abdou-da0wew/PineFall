import type { RenderLoopProps, Tree, BuildingData, Rock, Vec2, Stop, Job } from "./types";
import { snapshotGame } from "./types";
type Props = RenderLoopProps & {
  trees: Tree[];
  buildings: BuildingData[];
  rocks: Rock[];
  lamps: Vec2[];
  stops: Stop[];
  jobs: Job[];
};
type RenderObject =
  | ({ type: "tree" } & Tree)
  | ({ type: "building" } & BuildingData)
  | { type: "lamp" | "car" | "marker"; x: number; z: number };
import React, { useEffect, useRef } from "react";

// No WebGL calls: this renderer works when browser GPU contexts are disabled.
export default function CompatibilityWorld({
  game,
  trees,
  buildings,
  rocks,
  lamps,
  stops,
  jobs,
  advanceGame,
  onUpdate,
  quality,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas = canvasElement;
    const context = canvas.getContext("2d");
    if (!context) {
      window.pinefallDiagnostics?.report(
        "Compatibility renderer",
        "This browser also refused a Canvas 2D context.",
      );
      return;
    }
    const ctx = context;
    const desktop = window.pinefallDesktop?.runtime;
    const frameInterval = desktop ? 1000 / desktop.targetFps : 0;
    let nextRender = performance.now();
    let reportedReady = false;
    const staticObjects: RenderObject[] = [
      ...trees.map((t) => ({ type: "tree" as const, ...t })),
      ...buildings.map((b) => ({ type: "building" as const, ...b })),
      ...lamps.map(([x, z]) => ({ type: "lamp" as const, x, z })),
    ].sort((a, b) => a.x + a.z - b.x - b.z);
    const movingCar: RenderObject = { type: "car", x: game.x, z: game.z };
    const movingMarker: RenderObject = { type: "marker", x: 0, z: 35 };
    const objects: RenderObject[] = new Array(staticObjects.length + 2);
    function orderObjects() {
      const first =
        movingCar.x + movingCar.z <= movingMarker.x + movingMarker.z ? movingCar : movingMarker;
      const second = first === movingCar ? movingMarker : movingCar;
      let written = 0,
        inserted = 0;
      for (const item of staticObjects) {
        if (inserted === 0 && first.x + first.z <= item.x + item.z) {
          objects[written++] = first;
          inserted = 1;
        }
        if (inserted === 1 && second.x + second.z <= item.x + item.z) {
          objects[written++] = second;
          inserted = 2;
        }
        objects[written++] = item;
      }
      if (inserted === 0) objects[written++] = first;
      if (inserted < 2) objects[written] = second;
    }
    let frame = 0,
      last = performance.now(),
      hud = 0,
      cx = game.x,
      cz = game.z,
      w = 1,
      h = 1,
      ratio = 1;
    function resize() {
      ratio = quality === "pixel" ? 0.55 : Math.min(devicePixelRatio || 1, 1.5);
      if (desktop)
        ratio = Math.min(
          ratio,
          desktop.maxRenderWidth / Math.max(1, canvas.clientWidth),
          desktop.maxRenderHeight / Math.max(1, canvas.clientHeight),
        );
      w = canvas.clientWidth * ratio;
      h = canvas.clientHeight * ratio;
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      ctx.imageSmoothingEnabled = false;
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    function draw(now: number) {
      if (document.hidden) {
        last = now;
        nextRender = now;
        frame = requestAnimationFrame(draw);
        return;
      }
      if (frameInterval && now + 0.5 < nextRender) {
        frame = requestAnimationFrame(draw);
        return;
      }
      if (frameInterval)
        nextRender = now + frameInterval - Math.max(0, (now - nextRender) % frameInterval);
      if (!reportedReady) {
        window.pinefallDesktop?.ready();
        reportedReady = true;
      }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      advanceGame(dt);
      const follow = 1 - Math.exp(-3 * dt);
      cx += (game.x - Math.sin(game.angle) * game.speed * 0.2 - cx) * follow;
      cz += (game.z - Math.cos(game.angle) * game.speed * 0.2 - cz) * follow;
      const unit = 16 * ratio;
      function p(x: number, z: number, y = 0): Vec2 {
        return [
          w / 2 + (x - cx - (z - cz)) * 0.78 * unit,
          h / 2 + (x - cx + (z - cz)) * 0.45 * unit - y * unit,
        ];
      }
      function polygon(points: Vec2[], color: string) {
        ctx.fillStyle = color;
        ctx.beginPath();
        points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
      }
      function ground(x: number, z: number, ww: number, dd: number, color: string, y = 0) {
        polygon(
          [
            p(x - ww / 2, z - dd / 2, y),
            p(x + ww / 2, z - dd / 2, y),
            p(x + ww / 2, z + dd / 2, y),
            p(x - ww / 2, z + dd / 2, y),
          ],
          color,
        );
      }
      function line(a: Vec2, b: Vec2, color: string, width = 1) {
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.lineWidth = width * ratio;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      function glow(x: number, z: number, size: number, color: string) {
        const [px, py] = p(x, z);
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(1, 0.58);
        let g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * unit);
        g.addColorStop(0, color);
        g.addColorStop(1, "#efc67d00");
        ctx.fillStyle = g;
        ctx.fillRect(-size * unit, -size * unit, size * 2 * unit, size * 2 * unit);
        ctx.restore();
      }
      function cube(
        x: number,
        z: number,
        ww: number,
        dd: number,
        hh: number,
        top: string,
        left: string,
        right: string,
        y = 0,
      ) {
        let a = p(x - ww / 2, z - dd / 2, y + hh),
          b = p(x + ww / 2, z - dd / 2, y + hh),
          c = p(x + ww / 2, z + dd / 2, y + hh),
          d = p(x - ww / 2, z + dd / 2, y + hh);
        polygon([d, c, p(x + ww / 2, z + dd / 2, y), p(x - ww / 2, z + dd / 2, y)], left);
        polygon([b, c, p(x + ww / 2, z + dd / 2, y), p(x + ww / 2, z - dd / 2, y)], right);
        polygon([a, b, c, d], top);
      }
      ctx.fillStyle = "#30494b";
      ctx.fillRect(0, 0, w, h);
      ground(0, 0, 124, 124, "#50644f");
      for (const v of [-36, 0, 36]) {
        ground(v, 0, 8, 79, "#7a8068");
        ground(v, 0, 6.9, 79, "#53605b");
        ground(0, v, 79, 8, "#7a8068");
        ground(0, v, 79, 6.9, "#53605b");
      }
      for (const v of [-36, 0, 36])
        for (let i = -38; i < 40; i += 4) {
          ground(v, i, 0.12, 1.6, "#a8aa86");
          ground(i, v, 1.6, 0.12, "#a8aa86");
        }
      for (const x of [-36, 0, 36]) for (const z of [-36, 0, 36]) ground(x, z, 7, 7, "#53605b");
      ground(-4, 40, 21, 12, "#68776a");
      for (const [x, z] of lamps) glow(x + 1, z, 4, "#ffd18a38");
      const target = game.done ? 0 : game.loaded ? jobs[game.job].to : 0,
        stop = stops[target];
      let [sx, sy] = p(stop.x, stop.z);
      ctx.beginPath();
      ctx.ellipse(sx, sy, 3.5 * unit, 2 * unit, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#efc78318";
      ctx.fill();
      ctx.strokeStyle = game.loaded ? "#b3e8b6" : "#eec37a";
      ctx.lineWidth = 2 * ratio;
      ctx.stroke();
      glow(stop.x, stop.z, 4, "#f5cf7933");
      for (const r of rocks) {
        let [x, y] = p(r.x, r.z);
        polygon(
          [
            [x - r.s * unit, y],
            [x - r.s * 0.6 * unit, y - r.s * 0.7 * unit],
            [x + r.s * 0.5 * unit, y - r.s * 0.8 * unit],
            [x + r.s * unit, y],
            [x, y + r.s * 0.4 * unit],
          ],
          "#87927c",
        );
      }
      movingCar.x = game.x;
      movingCar.z = game.z;
      movingMarker.x = stop.x;
      movingMarker.z = stop.z;
      orderObjects();
      for (const o of objects) {
        let [px, py] = p(o.x, o.z);
        if (px < -150 * ratio || px > w + 150 * ratio || py < -100 * ratio || py > h + 200 * ratio)
          continue;
        if (o.type === "tree") {
          ctx.fillStyle = "#183c3439";
          ctx.beginPath();
          ctx.ellipse(
            px + o.s * unit,
            py + o.s * 0.3 * unit,
            o.s * 2.6 * unit,
            o.s * 0.8 * unit,
            -0.2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          cube(o.x, o.z, 0.35, 0.35, o.s * 2.3, "#685b45", "#504c3c", "#414a3d");
          for (let j = 0; j < 3; j++) {
            const [x, y] = p(o.x, o.z, (1.3 + j * 1.35) * o.s),
              spread = (2.2 - j * 0.45) * o.s * unit,
              high = (3.1 - j * 0.2) * o.s * unit;
            polygon(
              [
                [x - spread, y],
                [x, y - high],
                [x + spread, y],
                [x, y + spread * 0.25],
              ],
              ["#315548", "#3a5f4c", "#466c52"][j],
            );
            polygon(
              [
                [x, y - high],
                [x + spread, y],
                [x, y + spread * 0.25],
              ],
              "#234d4666",
            );
          }
        } else if (o.type === "building") {
          ground(o.x + 2, o.z + 2, o.w + 2, o.d + 2, "#203c3444");
          cube(o.x, o.z, o.w + 0.7, o.d + 0.7, 0.4, "#617161", "#3f5549", "#344b46");
          cube(o.x, o.z, o.w, o.d, o.h, o.c, o.c, "#52665c");
          const a = p(o.x - o.w * 0.6, o.z - o.d * 0.6, o.h),
            b = p(o.x + o.w * 0.6, o.z - o.d * 0.6, o.h),
            c = p(o.x + o.w * 0.6, o.z + o.d * 0.6, o.h),
            d = p(o.x - o.w * 0.6, o.z + o.d * 0.6, o.h),
            top = p(o.x, o.z, o.h + 3);
          polygon([a, b, top], o.roof);
          polygon([b, c, top], "#3d5056");
          polygon([c, d, top], o.roof);
          polygon([d, a, top], "#617174");
          for (const offset of [-0.28, 0.28]) {
            const x = o.x + o.w * offset,
              z = o.z + o.d / 2 + 0.04;
            polygon(
              [p(x - 0.65, z, 1.5), p(x + 0.65, z, 1.5), p(x + 0.65, z, 2.7), p(x - 0.65, z, 2.7)],
              "#f4cb87",
            );
            glow(x, z + 1, 2.5, "#ffca7722");
          }
          cube(
            o.x + o.w * 0.28,
            o.z - o.d * 0.2,
            0.8,
            0.8,
            2,
            "#788078",
            "#4b5955",
            "#42534e",
            o.h + 1,
          );
          if (o.kind === "observatory") {
            const [x, y] = p(o.x, o.z, o.h + 2);
            ctx.beginPath();
            ctx.ellipse(x, y, 3 * unit, 2.7 * unit, 0, Math.PI, Math.PI * 2);
            ctx.fillStyle = "#92aaa0";
            ctx.fill();
            line(p(o.x, o.z, o.h + 3), p(o.x, o.z - 3, o.h + 5), "#bbc5b6", 10);
          }
        } else if (o.type === "lamp") {
          line(p(o.x, o.z), p(o.x, o.z, 5), "#293f3e", 3);
          line(p(o.x, o.z, 5), p(o.x + 1.2, o.z, 5), "#293f3e", 3);
          let [x, y] = p(o.x + 1.2, o.z, 4.85);
          ctx.fillStyle = "#ffdda0";
          ctx.fillRect(x - 3 * ratio, y, 6 * ratio, 3 * ratio);
        } else if (o.type === "marker") {
          const [x, y] = p(o.x, o.z, 4 + Math.sin(now * 0.002) * 0.3);
          polygon(
            [
              [x, y - 9 * ratio],
              [x + 6 * ratio, y],
              [x, y + 9 * ratio],
              [x - 6 * ratio, y],
            ],
            game.loaded ? "#b9e4b6" : "#f6d99a",
          );
        } else if (o.type === "car") {
          function cp(x: number, z: number, y = 0) {
            return p(
              game.x + x * Math.cos(game.angle) + z * Math.sin(game.angle),
              game.z - x * Math.sin(game.angle) + z * Math.cos(game.angle),
              y,
            );
          }
          polygon(
            [cp(-0.65, -1.7, 0.1), cp(0.65, -1.7, 0.1), cp(4, -17, 0.1), cp(-4, -17, 0.1)],
            "#ffe3a418",
          );
          polygon([cp(-1.3, -1.9), cp(1.5, -1.9), cp(1.5, 2.4), cp(-1.3, 2.4)], "#172f3699");
          for (const side of [-1, 1])
            for (const z of [-1, 1])
              polygon(
                [
                  cp(side * 0.95 - 0.16, z - 0.45, 0.3),
                  cp(side * 0.95 + 0.16, z - 0.45, 0.3),
                  cp(side * 0.95 + 0.16, z + 0.45, 0.3),
                  cp(side * 0.95 - 0.16, z + 0.45, 0.3),
                ],
                "#1b2f32",
              );
          polygon(
            [
              cp(-0.95, -1.8, 0.65),
              cp(0.95, -1.8, 0.65),
              cp(0.95, 1.8, 0.65),
              cp(-0.95, 1.8, 0.65),
            ],
            "#deb779",
          );
          polygon(
            [cp(0.95, -1.8, 0.65), cp(0.95, 1.8, 0.65), cp(0.95, 1.8, 0.3), cp(0.95, -1.8, 0.3)],
            "#998657",
          );
          polygon(
            [cp(-0.82, -0.65, 1.3), cp(0.82, -0.65, 1.3), cp(0.82, 1.1, 1.3), cp(-0.82, 1.1, 1.3)],
            "#ecd096",
          );
          polygon(
            [
              cp(-0.72, -0.65, 1.35),
              cp(0.72, -0.65, 1.35),
              cp(0.72, -0.2, 1.35),
              cp(-0.72, -0.2, 1.35),
            ],
            "#34525a",
          );
          polygon(
            [cp(-0.6, 0.15, 1.5), cp(0.6, 0.15, 1.5), cp(0.6, 0.9, 1.5), cp(-0.6, 0.9, 1.5)],
            "#7f8058",
          );
          for (const x of [-0.6, 0.6]) {
            line(cp(x - 0.2, -1.83, 0.65), cp(x + 0.2, -1.83, 0.65), "#ffebbd", 3);
            line(cp(x - 0.2, 1.83, 0.65), cp(x + 0.2, 1.83, 0.65), "#df8266", 3);
          }
        }
      }
      for (let i = 0; i < 40; i++) {
        const x = Math.sin(i * 231.3) * 52,
          z = Math.cos(i * 127.7) * 52;
        let [px, py] = p(x, z, 2 + Math.sin(now * 0.001 + i) * 0.5);
        ctx.fillStyle = `rgba(232,223,153,${0.25 + Math.sin(now * 0.001 + i) * 0.2})`;
        ctx.fillRect(px, py, 2 * ratio, 2 * ratio);
      }
      hud += dt;
      if (hud > 0.09) {
        hud = 0;
        onUpdate(snapshotGame(game));
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [quality, onUpdate, game, lamps, buildings, trees, jobs, rocks, stops, advanceGame]);
  return (
    <canvas
      ref={canvasRef}
      aria-label="Pinefall isometric compatibility renderer"
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
