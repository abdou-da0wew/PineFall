import type { RenderLoopProps, RendererInfo } from "../types";
import { snapshotGame } from "../types";
type Props = RenderLoopProps & {
  onReady: (info: RendererInfo) => void;
  onFailure: (error: unknown) => void;
};
import React, { useEffect, useLayoutEffect, useRef } from "react";
import * as api from "vgpu";
import shader from "./world.wgsl";
import { createWorld } from "./createWorld.ts";

export default function VgpuWorld({
  game,
  advanceGame,
  onUpdate,
  quality,
  onReady,
  onFailure,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    latest = useRef({ quality, onReady, onFailure });
  useLayoutEffect(() => {
    latest.current = { quality, onReady, onFailure };
  }, [quality, onReady, onFailure]);
  useEffect(() => {
    let disposed = false,
      failed = false;
    let gpu: api.Gpu | undefined,
      world: ReturnType<typeof createWorld> | undefined,
      output: api.Surface | undefined,
      loop: api.FrameLoopHandle | undefined,
      unsubscribe: (() => void) | undefined,
      observer: ResizeObserver | undefined;
    let w = 1,
      h = 1,
      currentQuality = latest.current.quality,
      hud = 0;
    const element = canvasRef.current;
    if (!element) return;
    const canvas = element;
    const cleanup = () => {
      loop?.stop();
      observer?.disconnect();
      unsubscribe?.();
      world?.destroy();
      gpu?.dispose();
    };
    function fail(error: unknown) {
      if (disposed || failed) return;
      failed = true;
      clearTimeout(timeout);
      loop?.stop();
      queueMicrotask(() => {
        if (!disposed) latest.current.onFailure(error);
      });
    }
    const timeout = setTimeout(
      () => fail(new Error("vgpu WebGPU initialization timed out after 15 seconds.")),
      15000,
    );
    function resize() {
      if (!output || disposed || failed) return;
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      let ratio = latest.current.quality === "pixel" ? 0.55 : Math.min(devicePixelRatio || 1, 1.5);
      const desktop = window.pinefallDesktop?.runtime;
      if (desktop) ratio = Math.min(ratio, desktop.maxRenderWidth / w, desktop.maxRenderHeight / h);
      output.resize([Math.max(1, Math.round(w * ratio)), Math.max(1, Math.round(h * ratio))]);
      currentQuality = latest.current.quality;
    }
    void (async () => {
      if (!navigator.gpu)
        throw new Error("WebGPU is unavailable in this browser or preview context.");
      gpu = await api.init();
      if (disposed || failed) {
        gpu.dispose();
        return;
      }
      unsubscribe = gpu.onError((error) => fail(error));
      gpu.lost.then((info) =>
        fail(new Error(`vgpu WebGPU device lost: ${info.message || info.reason}`)),
      );
      output = api.surface(gpu, canvas, {
        depth: true,
        autoResize: false,
        dpr: 0.55,
        alphaMode: "opaque",
      });
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
      world = createWorld(api, gpu, shader, game);
      world.update(game, 0, w, h, 1 / 60);
      await world.prepare(output);
      if (disposed || failed) return;
      const activeWorld = world,
        activeOutput = output;
      api.frame(gpu, (f) => activeWorld.render(f, activeOutput));
      await gpu.settled();
      if (disposed || failed) return;
      clearTimeout(timeout);
      window.pinefallDesktop?.ready();
      const info = gpu.gpu.adapterInfo;
      const name = info
        ? [info.vendor, info.architecture, info.device, info.description]
            .filter(Boolean)
            .join(" · ")
        : "Browser WebGPU device (adapter identity not exposed)";
      latest.current.onReady({
        kind: "vgpu 0.6.0 · WebGPU 3D",
        name: name || "Browser WebGPU device",
        software: /swiftshader|llvmpipe|lavapipe|software/i.test(name),
        exposed: !!info,
      });
      const clock = api.clock(gpu);
      let accumulated = 0;
      const desktop = window.pinefallDesktop?.runtime;
      loop = api.frameLoop(gpu, (f) => {
        if (disposed || failed) return;
        try {
          if (currentQuality !== latest.current.quality) resize();
          accumulated += clock.deltaTime;
          if (document.hidden) {
            accumulated = 0;
            f.cancel();
            return;
          }
          if (desktop && accumulated < 1 / desktop.targetFps) {
            f.cancel();
            return;
          }
          const dt = Math.min(accumulated, 0.1);
          accumulated = 0;
          advanceGame(dt);
          activeWorld.update(game, clock.time, w, h, dt);
          activeWorld.render(f, activeOutput);
          hud += dt;
          if (hud > 0.09) {
            hud = 0;
            onUpdate(snapshotGame(game));
          }
        } catch (error) {
          f.cancel();
          fail(error);
        }
      });
    })().catch((error) => fail(error));
    return () => {
      disposed = true;
      clearTimeout(timeout);
      cleanup();
    };
  }, [game, advanceGame, onUpdate]);
  return (
    <canvas
      ref={canvasRef}
      aria-label="Pinefall vgpu WebGPU 3D renderer"
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
