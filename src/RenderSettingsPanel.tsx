import { DEFAULT_GRAPHICS, setGraphics, useGraphics } from "./graphicsSettings";
import type { GraphicsSettings } from "./graphicsSettings";
import type { RendererMode } from "./types";
export default function RenderSettingsPanel({ renderer }: { renderer: RendererMode }) {
  const settings = useGraphics();
  function slider(
    key: keyof GraphicsSettings,
    label: string,
    min: number,
    max: number,
    step: number,
    disabled = false,
  ) {
    return (
      <label className="render-slider" key={key}>
        <span>
          {label}
          <b>{String(settings[key])}</b>
        </span>
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number(settings[key])}
          disabled={disabled}
          onChange={(event) => setGraphics({ [key]: Number(event.target.value) })}
        />
      </label>
    );
  }
  function toggle(key: keyof GraphicsSettings, label: string, disabled = false) {
    return (
      <label className="render-toggle">
        <input
          type="checkbox"
          checked={Boolean(settings[key])}
          disabled={disabled}
          onChange={(event) => setGraphics({ [key]: event.target.checked })}
        />
        {label}
      </label>
    );
  }
  return (
    <section className="desktop-graphics" aria-label="Performance and effects">
      <div className="eyebrow">PERFORMANCE / WORLD / POST-PROCESSING</div>
      <p>Live settings, saved on this device. Performance-first defaults; reset at any time.</p>
      <div className="desktop-graphics-actions">
        <button onClick={() => setGraphics(DEFAULT_GRAPHICS)}>PERFORMANCE PRESET</button>
        <button
          onClick={() =>
            setGraphics({
              ...DEFAULT_GRAPHICS,
              post: true,
              glow: true,
              drawDistance: 95,
              lodDistance: 55,
            })
          }
        >
          ATMOSPHERE PRESET
        </button>
      </div>
      {toggle("culling", "Distance culling (Canvas / WebGL)", renderer === "vgpu")}
      {slider("drawDistance", "Scenery draw distance", 35, 110, 5, renderer === "vgpu")}
      {slider("lodDistance", "Tree detail distance", 20, 70, 2, renderer !== "3d")}
      {slider("renderScale", "Render resolution scale", 0.5, 1, 0.05, renderer === "vgpu")}
      {toggle("scenery", "Roadside landmarks and props", renderer === "vgpu")}
      {toggle("ambient", "Ambient fireflies / chimney smoke", renderer === "vgpu")}
      {toggle("post", "Enable post-processing")}
      {slider("exposure", "Exposure", 0.7, 1.4, 0.05, !settings.post)}
      {slider("contrast", "Contrast", 0.8, 1.3, 0.05, !settings.post)}
      {slider("saturation", "Saturation", 0, 1.5, 0.05, !settings.post)}
      {slider("vignette", "Vignette strength", 0, 0.8, 0.05, !settings.post)}
      {toggle("glow", "Light glow (WebGL only)", !settings.post || renderer !== "3d")}
      {slider(
        "threshold",
        "Glow luminance threshold",
        0.05,
        1,
        0.05,
        !settings.post || !settings.glow || renderer !== "3d",
      )}
      {slider(
        "strength",
        "Glow intensity",
        0,
        0.6,
        0.02,
        !settings.post || !settings.glow || renderer !== "3d",
      )}
      <p className="tip">
        WebGL glow is a small five-tap screen-space light spread, not full multi-pass bloom. Effects
        are off by default. Canvas/WebGPU use display color filters only; unsupported options are
        disabled. Culling never removes physics collisions or the destination marker. No SSAO,
        motion blur or depth-of-field.
      </p>
    </section>
  );
}
