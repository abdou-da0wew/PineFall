# Pinefall — Night Courier

An atmospheric, top-down 3D driving game made with React Three Fiber, React, and Three.js. All models are procedural; no external model assets are required.

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
