// No per-frame IPC or allocations: aggregate locally and send one small sample per five seconds.
let previous = 0,
  start = performance.now(),
  frames = 0,
  slow = 0,
  maxMs = 0,
  sumMs = 0,
  current = "none";
export function recordFrame(renderer: "canvas" | "webgl" | "webgpu") {
  if (!window.pinefallDesktop || document.hidden) return;
  const now = performance.now();
  if (renderer !== current) {
    current = renderer;
    previous = 0;
    window.pinefallDesktop.telemetry("renderer", { renderer });
  }
  if (previous) {
    const ms = now - previous;
    frames++;
    sumMs += ms;
    maxMs = Math.max(maxMs, ms);
    if (ms > 50) slow++;
  }
  previous = now;
}
if (window.pinefallDesktop) {
  const reset = () => {
    previous = 0;
    start = performance.now();
    frames = slow = maxMs = sumMs = 0;
  };
  const interval = setInterval(() => {
    const elapsedMs = performance.now() - start;
    if (!document.hidden && frames)
      window.pinefallDesktop?.telemetry("frames", {
        renderer: current,
        frames,
        slowFrames: slow,
        elapsedMs,
        fps: (frames * 1000) / elapsedMs,
        meanFrameMs: sumMs / frames,
        maxFrameMs: maxMs,
      });
    reset();
  }, 5000);
  document.addEventListener("visibilitychange", reset);
  window.addEventListener(
    "pagehide",
    () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", reset);
    },
    { once: true },
  );
}
