import { useState } from "react";
import type { DesktopBridge, GraphicsMode } from "../desktop/contracts";
import { errorMessage } from "./types";
const profiles: ReadonlyArray<{
  mode: GraphicsMode;
  name: string;
  description: string;
  linux?: boolean;
  flags: string;
}> = [
  {
    mode: "compatibility",
    name: "CPU Compatibility",
    description: "Recovery mode. Disable GPU acceleration and use Canvas 2D.",
    flags: "--disable-gpu --disable-gpu-compositing",
  },
  {
    mode: "hardware",
    name: "GPU · Chromium default",
    description: "Let Chromium choose its graphics backend. Hardware use depends on your driver.",
    flags: "Chromium default backend; GPU blocklist enabled",
  },
  {
    mode: "linux-opengl",
    name: "Linux GPU · OpenGL / X11",
    description:
      "Try this first for CEDAR. ANGLE OpenGL, X11/XWayland, no Vulkan or WebGPU fallback.",
    linux: true,
    flags:
      "--use-gl=angle --use-angle=gl --ozone-platform=x11 --disable-features=Vulkan --disable-accelerated-video-decode",
  },
  {
    mode: "linux-opengl-unblocked",
    name: "Linux GPU · bypass blocklist",
    description:
      "Experimental: same OpenGL profile, but ignore the GPU blocklist. May expose driver crashes or corruption.",
    linux: true,
    flags:
      "--use-gl=angle --use-angle=gl --ozone-platform=x11 --disable-features=Vulkan --disable-accelerated-video-decode --ignore-gpu-blocklist",
  },
];
export default function DesktopGraphicsSettings({ bridge }: { bridge: DesktopBridge }) {
  const [selected, setSelected] = useState<GraphicsMode>(bridge.runtime.mode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const profile = profiles.find((item) => item.mode === selected)!;
  async function apply() {
    setBusy(true);
    setMessage("Waiting for restart confirmation…");
    try {
      await bridge.setGraphicsMode(selected);
      setMessage("Restart canceled. Your running profile is unchanged.");
    } catch (error) {
      setMessage("Could not apply graphics profile: " + errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function exportReport() {
    setBusy(true);
    setMessage("Choose where to save the diagnostics report…");
    try {
      const saved = await bridge.exportDiagnostics();
      setMessage(
        saved ? "Diagnostics saved. Review the JSON before sharing it." : "Export canceled.",
      );
    } catch (error) {
      setMessage("Could not export diagnostics: " + errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="desktop-graphics" aria-label="Desktop GPU settings">
      <div className="eyebrow">DESKTOP GPU / RESTART REQUIRED</div>
      <p>
        Running: <strong>{profiles.find((item) => item.mode === bridge.runtime.mode)?.name}</strong>
        . Changing the selection below does not apply it yet.
      </p>
      <fieldset disabled={busy}>
        <legend>Graphics startup profile</legend>
        <div className="desktop-profile-grid">
          {profiles.map((item) => (
            <label key={item.mode} className={selected === item.mode ? "selected" : ""}>
              <input
                type="radio"
                name="desktop-graphics-profile"
                value={item.mode}
                checked={selected === item.mode}
                disabled={item.linux && bridge.runtime.platform !== "linux"}
                onChange={() => {
                  setSelected(item.mode);
                  setMessage("");
                }}
              />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.description}
                  {item.linux && bridge.runtime.platform !== "linux"
                    ? " Available only on Linux."
                    : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <details className="renderer-details">
        <summary>Selected profile: backend, display and flags</summary>
        <dl className="desktop-profile-details">
          <dt>Backend</dt>
          <dd>
            {selected === "compatibility"
              ? "CPU Canvas"
              : selected === "hardware"
                ? "Chromium default"
                : "ANGLE → OpenGL (WebGL 2)"}
          </dd>
          <dt>Window system</dt>
          <dd>
            {selected.startsWith("linux-") ? "X11 / XWayland (DISPLAY required)" : "System default"}
          </dd>
          <dt>Vulkan / WebGPU</dt>
          <dd>
            {selected.startsWith("linux-")
              ? "Vulkan disabled; game skips WebGPU"
              : selected === "compatibility"
                ? "GPU backends blocked"
                : "Browser availability and driver policy"}
          </dd>
          <dt>GPU blocklist</dt>
          <dd>
            {selected === "linux-opengl-unblocked" ? "BYPASSED — experimental" : "Not bypassed"}
          </dd>
          <dt>GPU sandbox</dt>
          <dd>Not disabled by Pinefall. No sandbox-bypass toggle.</dd>
          <dt>Video decode</dt>
          <dd>
            {selected.startsWith("linux-")
              ? "Hardware video decoding disabled"
              : "Chromium default"}
          </dd>
        </dl>
        <code className="desktop-flags">{profile.flags}</code>
        <p>
          These are bundled profiles, not independent driver flags. Physical GPU selection remains
          with Mesa / the OS; DRI_PRIME=0 does not necessarily mean Intel. Check the active adapter
          below after restarting.
        </p>
      </details>
      {selected === "linux-opengl-unblocked" && (
        <p className="renderer-note">
          Warning: bypassing the blocklist can cause graphics corruption, driver crashes or hangs.
          Try the regular Linux OpenGL profile first.
        </p>
      )}
      <p>
        Apply opens a confirmation dialog. Restarting ends your current shift; graphics preferences
        are saved. Use CPU Compatibility to recover.
      </p>
      <div className="desktop-graphics-actions">
        <button
          className="primary"
          disabled={busy || selected === bridge.runtime.mode}
          onClick={() => void apply()}
        >
          APPLY PROFILE & RESTART
        </button>
        <button disabled={busy} onClick={() => void exportReport()}>
          EXPORT GPU DIAGNOSTICS
        </button>
      </div>
      <p className="renderer-note" role="status" aria-live="polite">
        {message ||
          `Desktop budget: ${bridge.runtime.targetFps} FPS target · at most ${bridge.runtime.maxRenderWidth} × ${bridge.runtime.maxRenderHeight} internal pixels.`}
      </p>
    </section>
  );
}
