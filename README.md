# Pinefall — Night Courier

An atmospheric, top-down 3D driving game made with React Three Fiber, React, and Three.js. All models are procedural; no external model assets are required.

## Desktop · Linux and Windows

**For the AMD Radeon HD 6350 / TeraScale 2, leave Compatibility Mode enabled.** It is the default, not a GPU emulation mode: Electron hardware acceleration and GPU compositing are disabled before startup, the game uses Canvas 2D, and GPU selection/probing in the game is blocked. The OS desktop compositor may still use the display driver. This cannot protect against every OS/driver bug or promise zero stutter.

### Install and play

- **Linux x86-64:** download `Pinefall-1.0.0-linux-x86_64.AppImage`, run `chmod +x Pinefall-1.0.0-linux-x86_64.AppImage`, then launch it. A modern 64-bit Linux desktop with Electron's GTK/NSS/system-library dependencies is required. If FUSE is unavailable, use `./Pinefall-1.0.0-linux-x86_64.AppImage --appimage-extract-and-run`. Keep Chromium's OS sandbox enabled; do not run as root or use `--no-sandbox` as a normal workaround. Distributions that restrict user namespaces may need administrator-approved sandbox configuration or a locally packaged installation.
- **Windows x64:** extract the entire `Pinefall-1.0.0-win-x64.zip`, then run `Pinefall.exe` from that folder. Do not copy the EXE alone. Target a current supported Windows 10/11 environment, not Windows 7/8. These development packages are **unsigned**, so Windows may show a publisher warning. Only run a build whose origin you trust.
- The game and fonts are bundled locally; no web server or network connection is needed to play. Progress is session-only.

### Graphics and recovery

- Desktop rendering targets **30 FPS** and caps the internal render surface at **960 × 540**, including on high-DPI/4K monitors. The UI stays at native window resolution. This is a budget/target, not a minimum-performance guarantee.
- Compatibility Mode skips costly backdrop blur/grain. Static Canvas depth order is cached rather than sorted every frame; physics uses bounded substeps; camera vectors are reused; audio/timers/observers/render loops clean up on teardown.
- **Graphics → Hardware · experimental** requires explicit confirmation and a restart (ending the current shift). Chromium's GPU blocklist remains enabled. R3F shadows are disabled for desktop hardware mode, with capped resolution and a 30 FPS invalidation target. Actual hardware rendering depends on the adapter/driver: software or CPU fallback can still occur. **The HD 6350 is not assumed to support current WebGL 2 or WebGPU.** vgpu is still the actual Vercel WebGPU library, not a legacy-driver compatibility layer.
- A failed hardware startup is remembered and the next launch recovers to Compatibility Mode. GPU-process/renderer crashes offer a safe restart; detected hardware-mode crashes save safe mode for the next launch. Native driver/OS hangs can still prevent an orderly recovery.
- Emergency launch: `./Pinefall-1.0.0-linux-x86_64.AppImage --safe-mode` or `Pinefall.exe --safe-mode`. This overrides the saved graphics preference for that launch.
- **Graphics → Export diagnostics…** saves Electron/Chromium versions, graphics feature status, process memory/CPU snapshots and a bounded desktop log. Adapter information is queried only in hardware mode. Review the JSON before sharing it; driver strings and error messages can contain system details. No file is uploaded.

### Build with Bun

```sh
bun install --frozen-lockfile
bun run desktop:install       # download the Electron runtime for local execution
bun run desktop               # build and launch (no Vite server required)
bun run desktop:linux         # x64 AppImage
bun run desktop:windows       # x64 portable ZIP; cross-build does not need Wine
bun run desktop:unpacked      # Linux unpacked app for local inspection
```

Output: `build/releases/`. The TypeScript Electron entry points are compiled to generated CJS in `build/desktop-app`; generated JS is not authored source. Packaging explicitly excludes `node_modules` (including native vgpu/Dawn binaries): browser runtime dependencies are already bundled by Vite. The app uses sandboxed/context-isolated preload IPC, no renderer Node access, sender validation, a local-resource CSP, denied permissions, and restricted external navigation. Production Electron fuses disable RunAsNode, NODE_OPTIONS, and Node CLI inspection.

```sh
bun run desktop:prepare
bun run test:desktop          # on a desktop/display
# Headless Linux CI only (requires Xvfb):
xvfb-run -a bun run test:desktop
# After packaging Linux (also checks CSP inside the packaged app):
xvfb-run -a bun run test:desktop-package
```

The Electron test uses `--no-sandbox` **only in the test harness** for container compatibility. It covers CPU startup, gameplay, GPU-selection guards, 4K render-size bounds, native diagnostics export, failed-hardware-boot recovery, a short frame-cadence sample and repeated quality-toggle heap smoke test. It is **not** an HD 6350 driver test, a long-running memory certification, or a Windows runtime test. The existing browser CPU/WebGL/WebGPU and device-loss suites remain available below. A CI workflow builds both OS packages; Windows runtime validation on the target machine is still needed.

## Toolchain

All authored application, tooling, tests, and configuration code is **TypeScript / TSX**. `tsconfig.json` enables strict checking and disallows JavaScript input. There are no authored `.js`, `.jsx`, `.mjs`, or `.cjs` files. HTML, CSS, and WGSL remain in their native formats; Vite necessarily emits JavaScript for browsers.

- **Bun**: package manager, dev/build runtime, native test runtime, and subprocess runner
- **bun.lock**: committed reproducible dependency lock; no npm lockfile
- **TypeScript**: shared game/renderer interfaces, typed React props and refs, DOM diagnostics, and vgpu API contracts; no `any` or type-check suppression comments
- **Oxlint**: correctness rules, React checks, no unused variables, no explicit `any`, no suppression comments; warnings fail the lint command
- **Oxfmt**: formatting for source, scripts, and configuration

```sh
bun run typecheck
bun run lint
bun run format:check
bun run check               # all three checks
bun run format              # apply formatting
```

## Run

```sh
bun install --frozen-lockfile
bun run dev
```

Open the Vite preview. For a production bundle, run `bun run build`.

## Play

Start your shift, then press **E** at the golden depot marker to load the first parcel. Drive to the marked destination, stop inside the ring, and press **E** to deliver. Return to the depot for the next parcel. Complete all three deliveries to finish the route; return home to replay it. There is no time limit.

- WASD / arrow keys: accelerate, reverse, steer
- Space: brake
- Shift: rechargeable boost
- E: load / deliver
- M: valley map
- H: field guide
- R: recover at the depot and repair (cargo retained)
- Escape: pause / resume

Touch controls appear on narrow screens. Engine sound is optional. The toolbar toggles pixel / crisp rendering. Roads allow faster driving than grass. Trees, buildings, and forest boundaries block the vehicle; collisions affect the condition meter. Progress is session-only.

## Implementation

- Orthographic follow camera with speed-based look-ahead
- Low-resolution WebGL buffer with nearest-neighbor CSS scaling
- Instanced low-poly forest with dense perimeter walls
- Directional shadows, fog, headlights, warm lamps, emissive windows, and fireflies
- Delta-time vehicle movement, reversing, steering, collisions, braking, boost, and dust
- Three courier missions, rewards, minimap, expanded map, condition and boost HUD
- Optional synthesized engine audio using Web Audio

Source: `src/main.tsx`, shared contracts in `src/types.ts`, and `src/style.css`. `src/bootstrap.ts` installs the TypeScript diagnostics panel before dynamically importing the application, so module-startup failures can also be reported.

## Renderer selection

Open **Renderer** in the toolbar, or click the renderer badge.

- **Auto:** R3F WebGL → Vercel Labs **vgpu WebGPU** → CPU-compatible Canvas 2D.
- **R3F WebGL:** the original Three.js renderer. Browser-provided software adapters are accepted. Recognized software adapters use reduced resolution and no shadow maps.
- **vgpu · WebGPU (experimental):** a real, separately implemented renderer using `vgpu@0.6.0` and matching `@vgpu/wgsl@0.6.0`. It is **not** a virtual GPU provisioning feature. It uses WGSL lighting, depth-tested 3D, instance collections, a recorded static-scene bundle, pre-warmed pipelines, and a `frameLoop`. Shaders are reflected at build time with the Vite loader. The module is lazy-loaded, so Canvas/WebGL startup does not load the vgpu runtime.
- **CPU Canvas:** isometric Canvas 2D with the same physics, map, missions, and HUD. No WebGL or WebGPU context required; Canvas acceleration itself remains browser-controlled.

The map data and gameplay are shared. vgpu currently uses custom diffuse/fog/headlight shading and blocky wheels; it does not reproduce R3F shadow maps, fireflies, or dust exactly. It is explicitly experimental, not pixel-identical to R3F.

### Browser versus native CPU rendering

Browser vgpu requires an exposed WebGPU adapter. It can run on a software adapter such as SwiftShader when the browser allows it; webpage code cannot force that backend or install drivers. If WebGPU is absent, initialization fails, a pipeline fails, or the device is lost, the game switches to CPU Canvas with mission state retained. Initialization has a 15-second timeout; failed attempts can be retried manually. Components stop their loops and dispose their resources when switched or unmounted.

The `vgpu/node` entry point can use native software Vulkan on the CPU. That is a **native runtime API**, not a browser polyfill or a streamed game backend. The TypeScript test invokes this Node-compatible entry point directly under **Bun**, without starting Node.js. This project includes an offscreen render test of the exact vgpu scene on that runtime. In this workspace it rendered successfully with **llvmpipe**, while browser WebGPU rendered with **SwiftShader**.

To diagnose native software rendering:

```sh
bun --bun vgpu doctor --pretty
# If doctor prescribes these on your machine:
bun --bun vgpu install-dawn
bun --bun vgpu install-software-renderer
```

Force a renderer at startup with `?renderer=vgpu`, `?renderer=cpu`, or `?renderer=2d`. The active renderer and available adapter description appear in settings.

### Validation

```sh
bun run build
bun --bun vgpu check src/vgpu/world.wgsl --require-validation
bun test-vgpu-node.ts
bun test-vgpu-browser.ts
bun test-vgpu-fallback.ts
bun test-vgpu-loss.ts
```

- Native shader validation and offscreen scene readback pass on CPU llvmpipe. `vgpu-node-validation.json` records the pixel check and `vgpu-node-scene.png` is the captured scene.
- Browser WebGPU/SwiftShader test checks initialization, pickup, and driving; the captured frame was visually inspected.
- Missing WebGPU and explicit device destruction both return to CPU Canvas, retaining cargo.
- Actual hardware-GPU WebGPU has not been tested in this workspace.
- `check.ts`, `test-errors.ts`, and `test-compatibility.ts` cover the original renderer, diagnostics, and Canvas path.

The vgpu CLI dependency on the MCP server SDK is overridden to patched 2.x versions. No MCP server is started or bundled into the game. Use `bun audit` to inspect the current dependency graph.

### Implementation files

- `src/vgpu/VgpuWorld.tsx`: browser context, surface, initialization, frame loop, error/loss handling, and cleanup
- `src/vgpu/createWorld.ts`: shared browser/Node 3D scene, instancing, bundles, and camera
- `src/vgpu/world.wgsl`: vertex transforms, diffuse lighting, lamp pools, headlights, and fog
- `src/worldData.ts`: shared map, trees, buildings, and delivery definitions
- `src/CompatibilityWorld.tsx`: non-WebGL isometric renderer
- `src/renderers.ts`: WebGL probing and initial renderer selection

Documentation: https://vgpu.sh/docs

## Portable test commands

Install **Bun 1.4.4 or newer**, then install the browser test dependencies:

```sh
bun install --frozen-lockfile
bunx playwright install --with-deps chromium
bun run test                   # CPU driving, diagnostics, missing-WebGPU recovery
bun run test:webgl         # R3F / software-WebGL tests
bun run test:webgpu        # vgpu browser rendering and device-loss recovery
bun run test:vgpu-node     # Native software-Vulkan scene readback
bun run check:shader       # Device-backed WGSL validation
```

Browser suites start and stop their own temporary Vite server on port 4173. No running dev server is required. Set `TEST_PORT` to choose a different port, or `TEST_BASE_URL` to use a server you already run. Screenshots and reports go to git-ignored `artifacts/tests/`; use `TEST_ARTIFACT_DIR` to change that directory. Individual `.ts` scripts default to the dev server at port 5173 when invoked directly.

The WebGPU suite explicitly enables Chromium software Vulkan for testing; these launch flags configure the test browser only, not a visitor's browser. Native tests need a usable Vulkan or software adapter (`bun --bun vgpu doctor --pretty`).

## Desktop validation notes

Validated in the Linux container: strict TypeScript, Oxlint (zero warnings/errors), formatting, production build, browser CPU/WebGL/WebGPU/device-loss suites, staged Electron gameplay/recovery tests, and both the unpacked Linux app and extracted AppImage. Windows ZIP packaging completed; Windows runtime and physical Radeon HD 6350 testing are outstanding. The short Electron CPU cadence measurement was approximately 30 FPS; 20 quality changes retained about 1 MB of additional JavaScript heap after GC. These are smoke-test observations, not a long-duration leak or driver-stability guarantee.

Dependency audit currently reports **one moderate minimatch denial-of-service advisory (GHSA-g3hv-75wg-m249)** in the electron-builder development dependency tree. These packages are not shipped in the desktop ASAR; packaging uses repository-controlled glob patterns. A blanket major-version override would break legacy minimatch consumers, so it has not been forced. Keep the packaging toolchain updated, and do not run it over untrusted build configurations.

## CEDAR Linux GPU profiles (OpenGL, not Vulkan)

The reported `glxinfo` renderer **AMD CEDAR** with direct rendering means that the current GLX client can use the Radeon through Mesa. Vulkan reporting **llvmpipe** describes a CPU Vulkan device; it does not mean OpenGL is CPU-only. It also does not prove Chromium WebGL 2 will succeed. A desktop GL compatibility-profile version alone does not certify every WebGL 2 requirement.

Try **Graphics → Linux GPU · OpenGL / X11** and confirm the restart. The built-in profile requests:

```text
--use-gl=angle
--use-angle=gl
--ozone-platform=x11
--disable-features=Vulkan
--disable-accelerated-video-decode
```

This explicitly selects the ANGLE OpenGL backend, keeps the GPU sandbox and blocklist enabled, and avoids the vgpu/WebGPU path in the game. It requires X11 or working XWayland with `DISPLAY` available. It does not modify your Chromium configuration, Mesa installation, or kernel driver. Chromium switches are requests, not proof of hardware use; accepted backends vary by Electron/Chromium build.

If the regular profile refuses WebGL, try **Linux GPU · OpenGL / X11 · bypass blocklist**. This separately labelled experimental profile also requests `--ignore-gpu-blocklist`. It can expose driver defects that Chromium's blocklist avoids. Neither profile disables the GPU sandbox, disables driver bug workarounds, or claims to patch Chromium. CPU Compatibility remains the first-run/recovery default; selecting a profile in the menu persists it.

One-launch test (fully close the existing app first):

```sh
./Pinefall-1.0.0-linux-x86_64.AppImage --graphics=linux-opengl
# Only if the normal profile is refused:
./Pinefall-1.0.0-linux-x86_64.AppImage --graphics=linux-opengl-unblocked
# Recovery:
./Pinefall-1.0.0-linux-x86_64.AppImage --safe-mode
```

From source, run `bun run desktop:install`, `bun run desktop:prepare`, then `bun scripts/start-desktop.ts --graphics=linux-opengl`. CLI profile overrides apply for that launch; choosing another menu profile clears the CLI override on restart.

**Verify, don't infer:** open in-game Renderer settings. An ANGLE/OpenGL renderer naming AMD CEDAR is the expected hardware result. `llvmpipe`, `softpipe`, or `SwiftShader` means CPU software rendering. An unavailable/unexposed adapter identity is not proof either way. The desktop diagnostics export includes complete Electron GPU information, the profile's requested switches, and selected display/PRIME environment variables. `app.isHardwareAccelerationEnabled()` alone only describes the application setting, not the actual GPU used.

`DRI_PRIME=0` means the default Mesa device, **not necessarily Intel**. `i915` being loaded does not identify the GPU Chromium selected. Use `lspci -nnk | grep -EA3 'VGA|3D|Display'` to identify devices (the earlier `VEA` pattern is a typo). Compare `glxinfo -B` with an explicitly chosen Mesa `DRI_PRIME` PCI selector before launching the game with the same environment. Do not guess PCI addresses or assume ordinal 1 is AMD. A GLX test still does not guarantee ANGLE will select the same adapter: verify in game.

There is no universal 40% Wayland penalty established by this diagnostic output. X11/XWayland is an A/B test, not a universal cure. Likewise, `--disable-gpu --disable-software-rasterizer` is not a guarantee of a fully working software game: it disables GPU acceleration and a software 3D fallback. Windows may behave differently because Chromium can use ANGLE/D3D and a different driver stack; that is not proof Windows is glitch-free on this card.

A real Chromium/Mesa patch needs an identified reproducible failure, exact versions, GPU diagnostics and logs. These profiles are application-level backend selection and workload changes, **not driver patches**. The physical CEDAR GPU is not available in the build environment, so on-device validation remains required.

Profile validation: `bun run test:graphics` checks switches, explicit blocklist opt-in, recovery precedence and platform restrictions. `xvfb-run -a bun run test:linux-gpu` checks both real Electron startup profiles and the in-game WebGPU guard. In the build container the normal profile fell back to Canvas and the unblocked profile used software WebGL; neither result validates CEDAR hardware acceleration. No GPU-sandbox bypass is configured by the app; the container test harness alone supplies `--no-sandbox`.

### In-game graphics controls

Open the **Renderer** button in the game to enter Graphics Lab. The Electron app now exposes all four existing desktop profiles there: CPU Compatibility, Chromium-default GPU, Linux OpenGL/X11, and Linux OpenGL/X11 with blocklist bypass. Linux-only options are disabled on Windows. The running profile is shown separately from the pending selection; **Apply profile & restart** requires native confirmation and ends the shift. Canceling keeps the running profile unchanged.

Expand **Selected profile: backend, display and flags** to see exactly what the selected profile requests. These remain bundled profiles, not arbitrary independent Chromium-flag switches. GPU sandbox bypass and physical-adapter selection are not exposed as toggles. **Export GPU diagnostics** is available directly in the same panel. Renderer and Pixel/Crisp quality choices below it apply live without a restart. Desktop surface-size and frame-rate budgets remain fixed and are displayed, not adjustable controls.

The Electron UI regression test covers profile selection, blocklist warnings, canceled restart, live quality changes and a diagnostics export initiated through the in-game button.

## Offline observability

Open **Renderer → Graphics Lab → Local diagnostics** for log-folder access, active local alerts and a diagnostic-bundle export. Categorized rotating JSONL files capture events, errors, settings audits, periodic metrics, correlated operation spans and alert transitions. No cloud uploads, web server or observability services are required. A local Prometheus-format text snapshot is also written. See [the observability guide](docs/OBSERVABILITY.md) for schemas, limits, privacy, target definitions and interpretation.
