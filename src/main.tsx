import { useGraphics, createSpatialIndex } from "./graphicsSettings";
import RenderSettingsPanel from "./RenderSettingsPanel";
import PostProcessing from "./PostProcessing";
import {
  OptimizedForest as TreeForest,
  BatchedRocks,
  RoadMarkings,
  Scenery,
  ChimneySmoke,
  LANDMARKS,
} from "./WorldScenery";
import { loadGame, saveGame, courierRank, conditionBonus } from "./saveGame";
import { recordFrame } from "./telemetry";
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "./style.css";
import type { ThreeElements } from "@react-three/fiber";
import type {
  Vec3,
  BuildingData,
  GameState,
  GameSnapshot,
  Quality,
  RendererInfo,
  RendererMode,
  UpdateGame,
} from "./types";
import { snapshotGame, errorMessage } from "./types";
import { STOPS, JOBS, buildings, trees, rocks, lamps, rand } from "./worldData";
import DesktopGraphicsSettings from "./DesktopGraphicsSettings";
import CompatibilityWorld from "./CompatibilityWorld";
const VgpuWorld = React.lazy(() => import("./vgpu/VgpuWorld"));
import {
  initialRenderer,
  legacyOpenGLDesktop,
  probeRenderer,
  inspectContext,
  createCompatibleRenderer,
  CPU_INFO,
} from "./renderers";

const game: GameState = {
  x: 0,
  z: 34,
  angle: 0,
  speed: 0,
  steer: 0,
  dist: 0,
  health: 100,
  keys: {},
  playing: false,
  paused: false,
  job: 0,
  loaded: false,
  done: false,
  credits: 0,
  deliveries: 0,
  hit: 0,
  time: 0,
  boost: 100,
};
const checkpoint = loadGame();
if (checkpoint) Object.assign(game, checkpoint);
const focus = () => game;
const collisionIndex = createSpatialIndex(trees, 8);
type BoxProps = Omit<ThreeElements["mesh"], "position"> & { p?: Vec3; s?: Vec3; c?: string };
function Box({ p = [0, 0, 0], s = [1, 1, 1], c = "#fff", ...props }: BoxProps) {
  return (
    <mesh position={p} castShadow receiveShadow {...props}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.9} />
    </mesh>
  );
}
function Building({ b }: { b: BuildingData }) {
  return (
    <group position={[b.x, 0, b.z]}>
      <Box p={[0, b.h / 2, 0]} s={[b.w, b.h, b.d]} c={b.c} />
      <Box p={[0, 0.25, 0]} s={[b.w + 0.7, 0.5, b.d + 0.7]} c="#475c59" />
      <mesh position={[0, b.h + 1.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.max(b.w, b.d) * 0.79, 3, 4]} />
        <meshStandardMaterial color={b.roof} flatShading />
      </mesh>
      {[-0.28, 0.28].map((v, i) => (
        <mesh key={i} position={[b.w * v, b.h * 0.57, b.d / 2 + 0.03]}>
          <boxGeometry args={[1.5, 1.35, 0.1]} />
          <meshStandardMaterial color="#f5cb82" emissive="#ffbe68" emissiveIntensity={1.2} />
        </mesh>
      ))}
      <Box p={[0, 1.1, b.d / 2 + 0.05]} s={[1.3, 2.2, 0.15]} c="#344d4d" />
      <Box p={[b.w * 0.28, b.h + 1.8, -b.d * 0.2]} s={[1, 2, 1]} c="#4c565e" />
      {b.kind === "observatory" && (
        <>
          <mesh position={[0, b.h + 2, 0]}>
            <sphereGeometry args={[3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#9bb0b0" metalness={0.3} roughness={0.6} />
          </mesh>
          <mesh position={[0, b.h + 4, -1.4]} rotation={[-0.8, 0, 0]}>
            <cylinderGeometry args={[0.6, 0.75, 4, 8]} />
            <meshStandardMaterial color="#bac6bb" />
          </mesh>
        </>
      )}
    </group>
  );
}
function Roads() {
  return (
    <>
      <RoadMarkings />
      <Box p={[0, -0.18, 0]} s={[124, 0.3, 124]} c="#4c6456" />
      {[-36, 0, 36].map((x) => (
        <group key={"x" + x}>
          <Box p={[x, 0, 0]} s={[8, 0.08, 79]} c="#7d8170" />
          <Box p={[x, 0.045, 0]} s={[6.9, 0.05, 79]} c="#535f5e" />
        </group>
      ))}
      {[-36, 0, 36].map((z) => (
        <group key={"z" + z}>
          <Box p={[0, 0.01, z]} s={[79, 0.08, 8]} c="#7d8170" />
          <Box p={[0, 0.06, z]} s={[79, 0.05, 6.9]} c="#535f5e" />
        </group>
      ))}
      {[-36, 0, 36].flatMap((x) =>
        [-36, 0, 36].map((z) => (
          <Box key={x + "," + z} p={[x, 0.105, z]} s={[7, 0.02, 7]} c="#566260" />
        )),
      )}
      <Box p={[-4, 0.06, 40]} s={[21, 0.1, 12]} c="#68776a" />
    </>
  );
}
function Lamps() {
  return lamps.map(([x, z], i) => (
    <group key={i} position={[x, 0, z]}>
      <Box p={[0, 2.5, 0]} s={[0.2, 5, 0.2]} c="#374c4d" />
      <Box p={[0.6, 5, 0]} s={[1.5, 0.17, 0.2]} c="#374c4d" />
      <mesh position={[1.2, 4.85, 0]}>
        <boxGeometry args={[0.6, 0.15, 0.5]} />
        <meshStandardMaterial color="#ffe5ad" emissive="#ffbd65" emissiveIntensity={3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.2, 0.14, 0]}>
        <circleGeometry args={[3.8, 16]} />
        <meshBasicMaterial color="#eec779" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      {i < 2 && (
        <pointLight position={[1.2, 4, 0]} color="#ffc77f" intensity={35} distance={13} decay={2} />
      )}
    </group>
  ));
}
function Markers({ target, loaded }: { target: number; loaded: boolean }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.7;
      ref.current.position.y = 3.8 + Math.sin(clock.elapsedTime * 2) * 0.35;
    }
  });
  let stop = STOPS[target];
  return (
    <>
      <group position={[stop.x, 0, stop.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]}>
          <ringGeometry args={[3.1, 3.3, 32]} />
          <meshBasicMaterial color={loaded ? "#ade8c6" : "#f4c980"} transparent opacity={0.9} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
          <circleGeometry args={[3.1, 32]} />
          <meshBasicMaterial color="#eac77c" transparent opacity={0.09} depthWrite={false} />
        </mesh>
        <mesh ref={ref} position={[0, 4, 0]}>
          <octahedronGeometry args={[0.7, 0]} />
          <meshStandardMaterial
            color={loaded ? "#b3f2cc" : "#ffe0a0"}
            emissive={loaded ? "#6bb58e" : "#efb75f"}
            emissiveIntensity={0.8}
          />
        </mesh>
        <pointLight position={[0, 3, 0]} intensity={15} color="#f5d492" distance={9} />
      </group>
    </>
  );
}
function CarModel() {
  return (
    <>
      <Box p={[0, 0.65, 0]} s={[1.9, 0.65, 3.6]} c="#d1ac69" />
      <Box p={[0, 0.94, -0.65]} s={[1.82, 0.24, 1.4]} c="#efc783" />
      <Box p={[0, 1.3, 0.3]} s={[1.65, 0.75, 1.7]} c="#d6ba7e" />
      <Box p={[0, 1.36, -0.57]} s={[1.4, 0.46, 0.04]} c="#324f59" />
      <Box p={[0, 1.34, 1.17]} s={[1.38, 0.4, 0.04]} c="#324f59" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box p={[side * 0.84, 1.35, 0.3]} s={[0.03, 0.42, 1.3]} c="#3b5960" />
          {[-1.05, 1.1].map((z) => (
            <mesh
              key={z}
              position={[side * 0.96, 0.45, z]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.47, 0.47, 0.26, 10]} />
              <meshStandardMaterial color="#233438" />
            </mesh>
          ))}
          <mesh position={[side * 0.61, 0.76, -1.82]}>
            <boxGeometry args={[0.48, 0.23, 0.06]} />
            <meshStandardMaterial color="#fff1c9" emissive="#ffe1a0" emissiveIntensity={3} />
          </mesh>
          <mesh position={[side * 0.65, 0.7, 1.82]}>
            <boxGeometry args={[0.38, 0.2, 0.06]} />
            <meshStandardMaterial
              color="#dd775d"
              emissive="#ff5f3f"
              emissiveIntensity={game.keys[" "] ? 3 : 1}
            />
          </mesh>
        </group>
      ))}
      <Box p={[0, 0.44, -1.88]} s={[1.95, 0.18, 0.16]} c="#6c7b78" />
      <Box p={[0, 0.44, 1.88]} s={[1.95, 0.18, 0.16]} c="#6c7b78" />
      <Box p={[0, 1.78, 0.38]} s={[1.3, 0.12, 1.2]} c="#455b59" />
      <Box p={[-0.2, 1.95, 0.4]} s={[0.65, 0.3, 0.75]} c="#92724c" />
      <Box p={[0.4, 1.9, 0.2]} s={[0.35, 0.2, 0.6]} c="#73896d" />
    </>
  );
}
function Headlights() {
  const ref = useRef<THREE.SpotLight>(null!),
    target = useRef<THREE.Object3D>(null!);
  useEffect(() => {
    ref.current.target = target.current;
  }, []);
  return (
    <>
      <object3D ref={target} position={[0, 0, -13]} />
      <spotLight
        ref={ref}
        position={[0, 1.1, -1.8]}
        color="#ffdf9c"
        intensity={120}
        angle={0.54}
        penumbra={0.65}
        distance={24}
        decay={1.4}
      />
      {[-0.62, 0.62].map((x) => (
        <mesh key={x} position={[x, 0.18, -7.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([-0.22, 5.3, 0, 0.22, 5.3, 0, 3, -5.3, 0, -3, -5.3, 0]), 3]}
            />
            <bufferAttribute attach="index" args={[new Uint16Array([0, 2, 1, 0, 3, 2]), 1]} />
          </bufferGeometry>
          <meshBasicMaterial
            color="#ffe5af"
            transparent
            opacity={0.06}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}
let lastCollisionTime = -1;
function advanceGame(dt: number) {
  // Bounded substeps avoid tunneling and keep speed consistent at 30 FPS.
  let remaining = Math.min(Math.max(dt, 0), 0.1);
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 120);
    stepGame(step);
    remaining -= step;
  }
}
function stepGame(dt: number) {
  const g = game;
  if (g.playing && !g.paused) {
    g.time += dt;
    let k = g.keys,
      forward = k.w || k.arrowup,
      back = k.s || k.arrowdown,
      turn = (k.a || k.arrowleft ? 1 : 0) - (k.d || k.arrowright ? 1 : 0),
      brake = k[" "],
      fast = k.shift && forward && g.boost > 1;
    let onRoad = [-36, 0, 36].some((v) => Math.abs(g.x - v) < 4.3 || Math.abs(g.z - v) < 4.3);
    const max = fast ? 27 : onRoad ? 20 : 12;
    g.boost = THREE.MathUtils.clamp(g.boost + (fast ? -22 : 10) * dt, 0, 100);
    if (forward) g.speed += 12 * dt;
    else if (back) g.speed -= 15 * dt;
    else g.speed *= Math.pow(onRoad ? 0.45 : 0.12, dt);
    if (brake) g.speed *= Math.pow(0.006, dt);
    g.speed = THREE.MathUtils.clamp(g.speed, -8, max);
    g.steer = THREE.MathUtils.lerp(g.steer, turn, 1 - Math.exp(-8 * dt));
    if (Math.abs(g.speed) > 0.1)
      g.angle +=
        g.steer *
        1.85 *
        Math.min(Math.abs(g.speed) / 5, 1) *
        (g.speed > 0 ? 1 : -1) *
        dt *
        (brake ? 1.5 : 1) *
        (1 - Math.min(Math.abs(g.speed) / 35, 0.35));
    let nx = g.x - Math.sin(g.angle) * g.speed * dt,
      nz = g.z - Math.cos(g.angle) * g.speed * dt;
    let collision =
      Math.abs(nx) > 53.5 ||
      Math.abs(nz) > 53.5 ||
      buildings.some((b) => Math.abs(nx - b.x) < b.w / 2 + 1 && Math.abs(nz - b.z) < b.d / 2 + 1) ||
      collisionIndex.near(
        nx,
        nz,
        3,
        (t) =>
          Math.abs(nx - t.x) < 2 &&
          Math.abs(nz - t.z) < 2 &&
          Math.hypot(nx - t.x, nz - t.z) < t.s * 0.6 + 1,
      );
    if (collision) {
      if (g.time - lastCollisionTime > 0.7 && Math.abs(g.speed) > 5) {
        g.health = Math.max(1, g.health - Math.round(Math.abs(g.speed) * 0.6));
        g.hit = 1;
        lastCollisionTime = g.time;
      }
      g.speed *= -0.35;
    } else {
      g.x = nx;
      g.z = nz;
      g.dist += Math.abs(g.speed) * dt;
    }
    g.hit = Math.max(0, g.hit - dt * 1.6);
  }
}
function DesktopFrameBudget() {
  const { invalidate, size, setDpr } = useThree();
  const desktop = window.pinefallDesktop?.runtime;
  const graphics = useGraphics();
  useEffect(() => {
    if (desktop)
      setDpr(
        Math.min(
          0.75,
          (desktop.maxRenderWidth * graphics.renderScale) / Math.max(size.width, 1),
          (desktop.maxRenderHeight * graphics.renderScale) / Math.max(size.height, 1),
        ),
      );
  }, [desktop, setDpr, size.width, size.height, graphics.renderScale]);
  useEffect(() => {
    if (!desktop) return;
    const timer = setInterval(() => {
      if (!document.hidden) invalidate();
    }, 1000 / desktop.targetFps);
    return () => clearInterval(timer);
  }, [desktop, invalidate]);
  return null;
}

function Physics({ onUpdate }: { onUpdate: UpdateGame }) {
  const car = useRef<THREE.Group>(null!),
    dust = useRef<THREE.InstancedMesh>(null!);
  const { camera } = useThree();
  const timer = useRef(0);
  const dustParts = useMemo(() => Array.from({ length: 24 }, () => ({ x: 0, z: 0, age: 99 })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tick = useRef(0);
  const followPosition = useMemo(() => new THREE.Vector3(), []);
  useFrame((_state, delta) => {
    recordFrame("webgl");
    let dt = Math.min(delta, 0.1);
    let g = game;
    advanceGame(dt);
    if (g.playing && !g.paused) {
      if (Math.abs(g.speed) > 5) {
        tick.current += dt;
        if (tick.current > 0.07) {
          tick.current = 0;
          let p = dustParts.find((p) => p.age > 1.2);
          if (p) {
            p.x = g.x + Math.sin(g.angle) * 1.8;
            p.z = g.z + Math.cos(g.angle) * 1.8;
            p.age = 0;
          }
        }
      }
    }
    car.current.position.set(g.x, 0.07, g.z);
    car.current.rotation.y = g.angle;
    car.current.rotation.z = -g.steer * g.speed * 0.002;
    dustParts.forEach((p, i) => {
      p.age += dt;
      dummy.position.set(p.x, 0.25 + p.age * 0.4, p.z);
      let s = p.age < 1.2 ? (1 - p.age / 1.2) * 0.5 : 0;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      dust.current.setMatrixAt(i, dummy.matrix);
    });
    dust.current.instanceMatrix.needsUpdate = true;
    const ahead = g.speed * 0.22;
    let tx = g.x - Math.sin(g.angle) * ahead,
      tz = g.z - Math.cos(g.angle) * ahead;
    const factor = 1 - Math.exp(-3 * dt);
    camera.position.lerp(followPosition.set(tx + 23, 37, tz + 28), factor);
    camera.lookAt(camera.position.x - 23, 0, camera.position.z - 28);
    camera.updateProjectionMatrix();
    timer.current += dt;
    if (timer.current > 0.09) {
      timer.current = 0;
      onUpdate(snapshotGame(g));
    }
  });
  return (
    <>
      <group ref={car}>
        <CarModel />
        <Headlights />
      </group>
      <instancedMesh ref={dust} args={[undefined, undefined, 24]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#d3ba85" transparent opacity={0.24} />
      </instancedMesh>
    </>
  );
}
function Scene({ state, onUpdate }: { state: GameSnapshot; onUpdate: UpdateGame }) {
  return (
    <>
      <color attach="background" args={["#283e48"]} />
      <fog attach="fog" args={["#364f55", 48, 115]} />
      <ambientLight intensity={0.7} color="#adbccc" />
      <hemisphereLight args={["#b2c8d2", "#5c6d48", 1.4]} />
      <directionalLight
        position={[-25, 36, 12]}
        intensity={2.1}
        color="#f7c58b"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-65}
        shadow-camera-right={65}
        shadow-camera-top={65}
        shadow-camera-bottom={-65}
        shadow-camera-far={150}
        shadow-bias={-0.001}
      />
      <Roads />
      <TreeForest focus={focus} />
      <Scenery focus={focus} />
      <ChimneySmoke />
      {buildings.map((b, i) => (
        <Building key={i} b={b} />
      ))}
      <BatchedRocks />
      <Lamps />
      <Markers
        target={state.done ? 0 : state.loaded ? JOBS[state.job].to : 0}
        loaded={state.loaded}
      />
      <Physics onUpdate={onUpdate} />
      <Fireflies />
    </>
  );
}
function Fireflies() {
  const settings = useGraphics();
  const ref = useRef<THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>>(null!);
  const points = useMemo(() => {
    let a = [];
    for (let i = 0; i < 100; i++)
      a.push((rand() - 0.5) * 105, 1 + rand() * 4, (rand() - 0.5) * 105);
    return new Float32Array(a);
  }, []);
  useFrame(({ clock }) => {
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.3;
    ref.current.material.opacity = 0.45 + Math.sin(clock.elapsedTime) * 0.2;
  });
  return (
    <points ref={ref} visible={settings.ambient}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#e1e4ab" size={0.14} transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}
function MapView({ state, large = false }: { state: GameSnapshot; large?: boolean }) {
  let target = state.done ? 0 : state.loaded ? JOBS[state.job].to : 0;
  return (
    <svg viewBox="-63 -63 126 126" className={large ? "big-map" : "mini-map"}>
      <rect x="-62" y="-62" width="124" height="124" rx="3" fill="#172b2c" />
      <path d="M-52-52H52V52H-52Z" fill="#293d35" stroke="#46604b" strokeWidth="6" />
      {trees
        .filter((_, i) => i % 5 === 0)
        .map((t, i) => (
          <circle key={i} cx={t.x} cy={t.z} r="1.5" fill="#48614d" />
        ))}
      {[-36, 0, 36].map((v) => (
        <g key={v}>
          <path d={`M${v} -40V40 M-40 ${v}H40`} stroke="#809083" strokeWidth="3" />
        </g>
      ))}
      {buildings.map((b, i) => (
        <rect
          key={i}
          x={b.x - b.w / 2}
          y={b.z - b.d / 2}
          width={b.w}
          height={b.d}
          fill="#c3b18a"
          opacity=".65"
        />
      ))}
      {STOPS.map((s, i) => (
        <g key={i}>
          <circle
            cx={s.x}
            cy={s.z}
            r={i === target ? 4 : 2.3}
            fill={i === target ? "#efc87f" : "#7d9a88"}
            stroke={i === target ? "#fff2cc" : "none"}
            strokeWidth="1"
          />
          {large && (
            <text x={s.x} y={s.z - 7} textAnchor="middle" fill="#d5ddd0" fontSize="3.5">
              {s.label}
            </text>
          )}
        </g>
      ))}
      <g transform={`translate(${state.x},${state.z}) rotate(${(-state.angle * 180) / Math.PI})`}>
        <path d="M0 -4L3 3L0 1.5L-3 3Z" fill="#fff4d5" stroke="#182d2e" strokeWidth=".7" />
      </g>
    </svg>
  );
}
type WorldBoundaryProps = React.PropsWithChildren<{ onFallback: () => void }>;
class WorldErrorBoundary extends React.Component<WorldBoundaryProps, { failed: boolean }> {
  constructor(props: WorldBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    window.pinefallDiagnostics?.report(
      "3D renderer failed — trying fallback",
      error,
      info.componentStack,
    );
    this.props.onFallback();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
function App() {
  const graphics = useGraphics();
  const [hasCheckpoint, setHasCheckpoint] = useState(!!checkpoint);
  const [saveStatus, setSaveStatus] = useState(
    checkpoint ? "Checkpoint restored" : "No checkpoint yet",
  );
  const [initial] = useState(initialRenderer);
  const [renderer, setRenderer] = useState<RendererMode>(initial.mode),
    [backend, setBackend] = useState<RendererInfo>(initial.info),
    [rendererSettings, setRendererSettings] = useState(false),
    [rendererNote, setRendererNote] = useState(""),
    [rendererKey, setRendererKey] = useState(0);
  const resumeAfterSettings = useRef(false);
  const activeRenderer = useRef(renderer);
  useLayoutEffect(() => {
    activeRenderer.current = renderer;
  }, [renderer]);
  const [s, setS] = useState<GameSnapshot>(() => snapshotGame(game)),
    [started, setStarted] = useState(false),
    [paused, setPaused] = useState(false),
    [map, setMap] = useState(false),
    [quality, setQuality] = useState<Quality>("pixel"),
    [sound, setSound] = useState(false),
    [notice, setNotice] = useState(""),
    [help, setHelp] = useState(false);
  const audio = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null),
    noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (t: string) => {
    window.pinefallDesktop?.telemetry("action", { action: "game.notice", message: t });
    setNotice(t);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNotice(""), 4500);
  };
  function changeQuality() {
    const next = quality === "pixel" ? "sharp" : "pixel";
    window.pinefallDesktop?.telemetry("action", { action: "quality.changed", message: next });
    setQuality(next);
  }
  function openRendererSettings() {
    window.pinefallDesktop?.telemetry("action", { action: "graphics.opened" });
    resumeAfterSettings.current = game.playing && !game.paused;
    game.paused = true;
    game.keys = {};
    setRendererSettings(true);
  }
  function closeRendererSettings() {
    setRendererSettings(false);
    if (resumeAfterSettings.current) {
      game.paused = false;
      setPaused(false);
    }
  }
  function useCpuRenderer() {
    setRenderer("2d");
    setBackend(CPU_INFO);
    setRendererNote(
      "CPU-compatible mode is active. No WebGL or physical GPU is required. Your mission is unchanged.",
    );
  }
  function safeDesktop(): boolean {
    if (window.pinefallDesktop?.runtime.mode !== "compatibility") return false;
    setRendererNote(
      "Desktop Compatibility Mode disables GPU acceleration. Use Graphics → Linux GPU · OpenGL / X11 on Linux, or Hardware on Windows, then restart. Check the actual adapter after switching.",
    );
    return true;
  }
  function tryVgpu() {
    if (safeDesktop()) return;
    if (legacyOpenGLDesktop()) {
      setRendererNote(
        "The Linux OpenGL profile intentionally skips WebGPU: Vulkan on your CEDAR system reports CPU llvmpipe. Use R3F WebGL and verify its adapter below.",
      );
      return;
    }
    setBackend({
      kind: "vgpu · initializing WebGPU",
      name: "Requesting adapter and pre-warming pipelines…",
      software: false,
    });
    setRendererKey((n) => n + 1);
    setRenderer("vgpu");
    setRendererNote(
      "Starting Vercel Labs vgpu. This is a separate WebGPU renderer, not virtual-GPU provisioning.",
    );
  }
  function vgpuFailed(error: unknown) {
    setRenderer("2d");
    setBackend(CPU_INFO);
    setRendererNote(
      "vgpu could not start: " +
        errorMessage(error) +
        ". CPU Canvas is active; mission progress is unchanged.",
    );
    window.pinefallDiagnostics?.report("vgpu WebGPU → CPU fallback", error);
  }
  function vgpuReady(info: RendererInfo) {
    window.pinefallDesktop?.telemetry("renderer", {
      renderer: "webgpu",
      message: JSON.stringify(info),
    });
    setBackend(info);
    setRendererNote(
      "vgpu WebGPU is rendering the 3D world with WGSL, instanced geometry, and shared gameplay.",
    );
  }
  function tryAuto() {
    if (safeDesktop()) return;
    const result = probeRenderer();
    if (result.available) {
      setBackend(result.info);
      setRendererKey((n) => n + 1);
      setRenderer("3d");
      setRendererNote("Auto selected R3F WebGL.");
    } else if (navigator.gpu && !legacyOpenGLDesktop()) {
      tryVgpu();
    } else {
      useCpuRenderer();
    }
  }
  function tryWebGL() {
    if (safeDesktop()) return;
    if (renderer === "3d") {
      setRendererNote(
        "WebGL is already active. The adapter below is the one your browser supplies; this page cannot choose a different physical or virtual GPU.",
      );
      return;
    }
    const result = probeRenderer();
    if (result.available) {
      setBackend(result.info);
      setRendererKey((n) => n + 1);
      setRenderer("3d");
      setRendererNote(
        "WebGL context accepted. Software and virtual adapters are permitted; see the actual adapter below.",
      );
    } else {
      setRenderer("2d");
      setBackend(CPU_INFO);
      setRendererNote(
        "WebGL 2 was refused, including the low-power retry. No CPU WebGL or vGPU context is exposed by this browser. Staying in CPU Canvas mode.",
      );
    }
  }
  function rendererFailed() {
    if (navigator.gpu && !legacyOpenGLDesktop()) tryVgpu();
    else useCpuRenderer();
  }
  function checkpointNow() {
    const ok = saveGame(game);
    setSaveStatus(ok ? "Checkpoint saved" : "Saving unavailable on this device");
    if (ok) setHasCheckpoint(true);
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (game.playing) checkpointNow();
    }, 10000);
    const save = () => {
      if (game.playing) saveGame(game);
    };
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
    };
  }, []);
  function resetCar() {
    game.x = 0;
    game.z = 28;
    game.angle = 0;
    game.speed = 0;
    game.health = 100;
    notify("Back at the depot. Your wagon is ready.");
    checkpointNow();
  }
  function interact() {
    if (!game.playing || game.paused) return;
    let target = game.done ? 0 : game.loaded ? JOBS[game.job].to : 0;
    if (Math.hypot(game.x - STOPS[target].x, game.z - STOPS[target].z) > 6.5) {
      notify("Follow the gold marker to your next stop.");
      return;
    }
    if (Math.abs(game.speed) > 2.5) {
      notify("Come to a stop to make the handoff.");
      return;
    }
    if (game.done) {
      game.job = 0;
      game.done = false;
      game.loaded = false;
      notify("A new route is ready. Press E to load up.");
    } else if (!game.loaded) {
      game.loaded = true;
      game.health = 100;
      notify(`${JOBS[game.job].cargo} loaded. Drive safe, courier.`);
    } else {
      let job = JOBS[game.job];
      const bonus = conditionBonus(game.health, job.pay);
      game.credits += job.pay + bonus;
      game.deliveries++;
      game.loaded = false;
      if (game.job === JOBS.length - 1) {
        game.done = true;
        notify(
          `Route complete. +${job.pay + bonus} credits. Rank: ${courierRank(game.deliveries)}.`,
        );
      } else {
        game.job++;
        notify(
          `Delivery complete. +${job.pay + bonus} credits (${bonus} careful-driving bonus). Return to the depot.`,
        );
      }
      game.health = Math.min(100, game.health + 15);
    }
    checkpointNow();
    setS(snapshotGame(game));
  }
  function togglePause() {
    if (!game.playing) return;
    game.paused = !game.paused;
    setPaused(game.paused);
    if (game.paused) checkpointNow();
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      let k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      game.keys[k] = true;
      if (e.repeat) return;
      if (k === "e") interact();
      if (k === "r") resetCar();
      if (k === "escape") togglePause();
      if (k === "m") setMap((m) => !m);
      if (k === "h") setHelp((h) => !h);
    };
    const up = (e: KeyboardEvent) => {
      game.keys[e.key.toLowerCase()] = false;
    };
    const blur = () => {
      game.keys = {};
      if (game.playing) {
        game.paused = true;
        setPaused(true);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    if (!sound) {
      if (audio.current) audio.current.ctx.suspend();
      return;
    }
    if (!audio.current) {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        filter = ctx.createBiquadFilter();
      osc.type = "sawtooth";
      filter.type = "lowpass";
      filter.frequency.value = 180;
      gain.gain.value = 0.025;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      audio.current = { ctx, osc, gain };
    }
    audio.current.ctx.resume();
    const id = setInterval(() => {
      let a = audio.current;
      if (!a) return;
      a.osc.frequency.setTargetAtTime(32 + Math.abs(game.speed) * 3, a.ctx.currentTime, 0.1);
      a.gain.gain.setTargetAtTime(game.playing && !game.paused ? 0.025 : 0, a.ctx.currentTime, 0.1);
    }, 100);
    return () => clearInterval(id);
  }, [sound]);
  useEffect(
    () => () => {
      clearTimeout(noteTimer.current);
      const sound = audio.current;
      if (sound) {
        sound.osc.stop();
        void sound.ctx.close();
        audio.current = null;
      }
    },
    [],
  );
  const target = s.done ? 0 : s.loaded ? JOBS[s.job].to : 0,
    distance = Math.round(Math.hypot(s.x - STOPS[target].x, s.z - STOPS[target].z)),
    near = distance < 7;
  const job = JOBS[s.job];
  return (
    <div className={"app " + (started ? "in-game" : "intro")}>
      <div
        className={"world " + quality}
        style={
          graphics.post && renderer !== "3d"
            ? {
                filter: `brightness(${graphics.exposure}) contrast(${graphics.contrast}) saturate(${graphics.saturation})`,
              }
            : undefined
        }
      >
        {renderer === "vgpu" ? (
          <WorldErrorBoundary
            key={"vgpu" + rendererKey}
            onFallback={() => vgpuFailed(new Error("vgpu module or component failed to load."))}
          >
            <React.Suspense
              fallback={<div className="renderer-loading">Initializing vgpu · WebGPU 3D…</div>}
            >
              <VgpuWorld
                key={rendererKey}
                game={game}
                advanceGame={advanceGame}
                onUpdate={setS}
                quality={quality}
                onReady={vgpuReady}
                onFailure={vgpuFailed}
              />
            </React.Suspense>
          </WorldErrorBoundary>
        ) : renderer === "2d" ? (
          <CompatibilityWorld
            game={game}
            trees={trees}
            buildings={buildings}
            rocks={rocks}
            lamps={lamps}
            stops={STOPS}
            jobs={JOBS}
            advanceGame={advanceGame}
            onUpdate={setS}
            quality={quality}
          />
        ) : (
          <WorldErrorBoundary key={rendererKey} onFallback={rendererFailed}>
            <Canvas
              shadows={!backend.software && !window.pinefallDesktop}
              frameloop={window.pinefallDesktop ? "demand" : "always"}
              orthographic
              dpr={
                window.pinefallDesktop
                  ? Math.min(
                      0.75,
                      (960 * graphics.renderScale) / window.innerWidth,
                      (540 * graphics.renderScale) / window.innerHeight,
                    )
                  : (quality === "pixel"
                      ? backend.software
                        ? 0.45
                        : 0.55
                      : backend.software
                        ? 0.8
                        : 1.5) * graphics.renderScale
              }
              camera={{ position: [23, 37, 62], zoom: 16, near: 0.1, far: 170 }}
              gl={createCompatibleRenderer}
              onCreated={({ gl }) => {
                window.pinefallDesktop?.ready();
                setBackend(inspectContext(gl.getContext()));
                window.pinefallDesktop?.telemetry("renderer", {
                  renderer: "webgl",
                  message: JSON.stringify(inspectContext(gl.getContext())),
                });
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.1;
                gl.domElement.addEventListener(
                  "webglcontextlost",
                  () => {
                    if (activeRenderer.current !== "3d") return;
                    rendererFailed();
                    window.pinefallDiagnostics?.report(
                      "WebGL context lost",
                      "Trying the next renderer. Your session is retained.",
                    );
                  },
                  { once: true },
                );
              }}
            >
              <DesktopFrameBudget />
              <Scene state={s} onUpdate={setS} />
              <PostProcessing />
            </Canvas>
          </WorldErrorBoundary>
        )}
      </div>
      <div
        className="vignette"
        style={{ opacity: !started ? 1 : graphics.post ? graphics.vignette : 0 }}
      />

      {
        <button
          className="compatibility-badge"
          onClick={openRendererSettings}
          title="Renderer settings and actual adapter"
        >
          <span />{" "}
          {renderer === "vgpu"
            ? "EXPERIMENTAL · VGPU WEBGPU"
            : renderer === "2d"
              ? "CPU · 2D COMPATIBILITY MODE"
              : backend.software
                ? "CPU · SOFTWARE WEBGL"
                : backend.virtual
                  ? "WEBGL · VIRTUAL ADAPTER"
                  : "R3F · WEBGL 2"}{" "}
          <span>⚙</span>
        </button>
      }
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (started) togglePause();
          }}
        >
          <span className="brand-icon">♠</span>
          <span>
            PINEFALL<small>NIGHT COURIER</small>
          </span>
        </a>
        <div className="top-center">
          <i /> FREE ROAM <span>/</span> DUSK, 18:42
        </div>
        <nav>
          <button onClick={openRendererSettings} title="Renderer settings">
            ⚙<span> RENDERER</span>
          </button>
          <button onClick={() => setSound((v) => !v)} title="Engine audio">
            {sound ? "♫" : "♩"}
            <span> SOUND {sound ? "ON" : "OFF"}</span>
          </button>
          <button onClick={changeQuality} title="Change render resolution">
            ▦<span> {quality === "pixel" ? "PIXEL" : "CRISP"}</span>
          </button>
          <button
            onClick={() => {
              if (started) togglePause();
              else setHelp((v) => !v);
            }}
            title="Pause and controls"
          >
            {paused ? "▶" : "Ⅱ"}
          </button>
        </nav>
      </header>
      {!started ? (
        <>
          <section className="welcome">
            <div className="eyebrow">
              <span /> AN AFTER-HOURS DRIVING ADVENTURE
            </div>
            <h1>
              The woods are quiet.
              <br />
              Your shift isn’t.
            </h1>
            <p>
              A trusty wagon. A few late deliveries.
              <br />
              Find your way through the last light of Pinefall.
            </p>
            <button
              className="primary"
              onClick={() => {
                game.playing = true;
                game.paused = false;
                setStarted(true);
                setPaused(false);
                notify(
                  hasCheckpoint
                    ? "Welcome back. Your route and credits are restored."
                    : "Welcome to Pinefall. Pull into the gold circle and press E.",
                );
              }}
            >
              {hasCheckpoint ? "CONTINUE SHIFT" : "START YOUR SHIFT"} <span>↗</span>
            </button>
            <div className="start-note">
              {hasCheckpoint
                ? `${courierRank(s.deliveries)} · ${s.deliveries} deliveries · ${s.credits} credits`
                : "NO CLOCK TO BEAT. JUST THE ROAD AHEAD."}
            </div>
          </section>
          <div className="intro-footer">
            <div>
              <span>01 /</span> A SMALL WORLD TO GET LOST IN
            </div>
            <div>
              BUILT IN 3D. SEEN IN PIXELS. <span>✦</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="location-label">
            <span>
              ⌖{" "}
              {
                LANDMARKS.reduce(
                  (best, p) =>
                    Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(s.x - best.x, s.z - best.z)
                      ? p
                      : best,
                  LANDMARKS[0],
                ).name
              }
            </span>
            <small>
              {courierRank(s.deliveries)} · {saveStatus}
            </small>
          </div>
          <aside className="mission panel">
            <div className="eyebrow">
              NIGHT SHIFT{" "}
              <span className="counter">
                {s.done ? "03" : String(s.job + 1).padStart(2, "0")} / 03
              </span>
            </div>
            <h2>{s.done ? "A good night’s work" : job.title}</h2>
            <p>
              {s.done
                ? "All three deliveries made. Head back to the depot to start another shift."
                : s.loaded
                  ? job.desc
                  : "Return to Southbound depot to collect your next parcel."}
            </p>
            <div className="mission-line" />
            <div className="objective">
              <div className="diamond">◇</div>
              <div>
                <small>{s.done ? "RETURN HOME" : s.loaded ? "DELIVER TO" : "PICK UP AT"}</small>
                <strong>{STOPS[target].name}</strong>
              </div>
              <span>{distance}m</span>
            </div>
            <div className="cargo">
              <span>{s.loaded ? "▣ " + job.cargo : "▱ Cargo bay empty"}</span>
              <span>{s.done ? "✓ COMPLETE" : "+" + job.pay + " CR"}</span>
            </div>
          </aside>
          <aside className="map-panel panel">
            <div className="map-head">
              <span>
                <i /> PINEFALL VALLEY
              </span>
              <button onClick={() => setMap(true)}>↗</button>
            </div>
            <MapView state={s} />
            <div className="map-footer">
              <span>N ↑</span>
              <span>FOREST DISTRICT</span>
              <kbd>M</kbd>
            </div>
          </aside>
          <div className="left-bottom">
            <div className="wallet">
              <span className="coin">◈</span>
              <strong>{s.credits.toLocaleString()}</strong>
              <span>CR</span>
              <div />
              <span>{s.deliveries} DELIVERIES</span>
            </div>
            <button className="help-button" onClick={() => setHelp((v) => !v)}>
              <kbd>H</kbd> FIELD GUIDE <span>↗</span>
            </button>
          </div>
          <div className="drive-hud panel">
            <div className="speed">
              <div className="gear">
                {s.speed < -0.5 ? "R" : Math.abs(s.speed) < 0.5 ? "N" : "D"}
              </div>
              <strong>{String(Math.round(Math.abs(s.speed) * 3.6)).padStart(2, "0")}</strong>
              <span>KM/H</span>
            </div>
            <div className="meter-label">
              <span>WAGON CONDITION</span>
              <span>{Math.round(s.health)}%</span>
            </div>
            <div className="meter">
              <i style={{ width: s.health + "%", background: s.health < 30 ? "#e78e76" : "" }} />
            </div>
            <div className="meter-label boost-label">
              <span>
                BOOST <kbd>SHIFT</kbd>
              </span>
              <span>{Math.round(s.boost)}%</span>
            </div>
            <div className="meter boost">
              <i style={{ width: s.boost + "%" }} />
            </div>
          </div>
          <div className="bottom-controls">
            <span>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> DRIVE
            </span>
            <span>
              <kbd>SPACE</kbd> BRAKE
            </span>
            <span>
              <kbd>R</kbd> RECOVER
            </span>
          </div>
          {near && !paused && (
            <div className="interaction">
              <kbd>E</kbd>
              <div>
                <strong>
                  {Math.abs(s.speed) > 2.5
                    ? "Slow down for the handoff"
                    : s.done
                      ? "Begin another shift"
                      : s.loaded
                        ? "Deliver parcel"
                        : "Load your delivery"}
                </strong>
                <small>{STOPS[target].name}</small>
              </div>
            </div>
          )}
          <div className="touch-controls">
            <div>
              <button
                onPointerDown={() => (game.keys.a = true)}
                onPointerUp={() => (game.keys.a = false)}
                onPointerLeave={() => (game.keys.a = false)}
              >
                ◀
              </button>
              <button
                onPointerDown={() => (game.keys.d = true)}
                onPointerUp={() => (game.keys.d = false)}
                onPointerLeave={() => (game.keys.d = false)}
              >
                ▶
              </button>
            </div>
            <button onClick={interact}>E</button>
            <div>
              <button
                onPointerDown={() => (game.keys.s = true)}
                onPointerUp={() => (game.keys.s = false)}
                onPointerLeave={() => (game.keys.s = false)}
              >
                ▼
              </button>
              <button
                onPointerDown={() => (game.keys.w = true)}
                onPointerUp={() => (game.keys.w = false)}
                onPointerLeave={() => (game.keys.w = false)}
              >
                ▲
              </button>
            </div>
          </div>
        </>
      )}
      {notice && started && (
        <div className="toast">
          <span>✦</span>
          {notice}
        </div>
      )}
      {s.hit > 0 && <div className="hit" style={{ opacity: s.hit * 0.3 }} />}
      {(paused || help) && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="eyebrow">PINEFALL / FIELD GUIDE</div>
            <h2>{paused ? "Take a breather." : "Make yourself at home."}</h2>
            {paused && (
              <div className="desktop-graphics-actions">
                <button onClick={checkpointNow}>SAVE CHECKPOINT</button>
                <button
                  onClick={() => {
                    checkpointNow();
                    game.playing = false;
                    game.paused = false;
                    setStarted(false);
                    setPaused(false);
                  }}
                >
                  SAVE & RETURN TO TITLE
                </button>
                <button
                  onClick={() => {
                    setHelp(false);
                    openRendererSettings();
                  }}
                >
                  GRAPHICS & EFFECTS
                </button>
              </div>
            )}
            {paused && (
              <p>
                {saveStatus} · {courierRank(s.deliveries)} · {s.credits} credits
              </p>
            )}
            <p>
              Pick up parcels at the Southbound depot, then follow the diamond on your map. Stop
              inside the glowing circle and press E to make a delivery.
            </p>
            {renderer === "2d" && (
              <div className="tip">
                <strong>CPU-compatible rendering is active.</strong>
                <br />
                The game is using a Canvas 2D renderer with the same driving, collisions, and
                missions. Use Renderer settings to try R3F WebGL or the experimental Vercel Labs
                vgpu WebGPU renderer. This page cannot override browser or device GPU restrictions.
              </div>
            )}
            <div className="controls-list">
              {[
                ["W A S D / ↑ ↓ ← →", "Accelerate, reverse & steer"],
                ["SPACE", "Brake / tight turns"],
                ["SHIFT", "A little extra speed"],
                ["E", "Pick up / deliver"],
                ["M", "Open the valley map"],
                ["R", "Recover & repair at depot"],
                ["ESC", "Pause / resume"],
              ].map(([k, v]) => (
                <div key={k}>
                  <kbd>{k}</kbd>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <div className="tip">
              Stay on the roads for more speed. The tree line is the edge of the world. There’s no
              time limit—take the scenic route.
            </div>
            <button
              className="primary"
              onClick={() => {
                setHelp(false);
                setPaused(false);
                game.paused = false;
              }}
            >
              {" "}
              {started ? "BACK TO THE ROAD" : "GOT IT"} <span>→</span>
            </button>
          </section>
        </div>
      )}
      {map && (
        <div className="modal-backdrop" onClick={() => setMap(false)}>
          <section className="modal map-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">
              YOUR LITTLE CORNER OF THE WORLD <button onClick={() => setMap(false)}>✕</button>
            </div>
            <h2>Pinefall Valley</h2>
            <MapView state={s} large />
            <div className="map-legend">
              <span>▲ YOU</span>
              <span>● NEXT STOP</span>
              <span>━ ROAD</span>
            </div>
            <p>The golden marker is your next stop. Roads form a grid through the forest.</p>
            <button className="primary" onClick={() => setMap(false)}>
              BACK TO THE ROAD <span>→</span>
            </button>
          </section>
        </div>
      )}
      {rendererSettings && (
        <div
          className="modal-backdrop renderer-backdrop"
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
        >
          <section
            className="modal renderer-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Renderer settings"
          >
            <div className="eyebrow">PINEFALL / GRAPHICS LAB</div>
            <h2>A road for every machine.</h2>
            {window.pinefallDesktop ? (
              <DesktopGraphicsSettings
                bridge={window.pinefallDesktop}
                beforeRestart={checkpointNow}
              />
            ) : (
              <p className="tip">
                Desktop GPU startup profiles are available in the Electron app. A browser tab cannot
                change Chromium launch flags; live renderer choices are available below.
              </p>
            )}
            <RenderSettingsPanel renderer={renderer} />
            <div className="eyebrow">LIVE SETTINGS / NO RESTART</div>
            <p>
              Switch the scene renderer without losing your shift. Desktop startup profiles still
              control which GPU backends are allowed. The Linux OpenGL profiles skip WebGPU.
            </p>
            <button className="graphics-quality" onClick={changeQuality}>
              Render quality: {quality === "pixel" ? "Pixel" : "Crisp"} — switch to{" "}
              {quality === "pixel" ? "Crisp" : "Pixel"}
            </button>
            <div className="renderer-options">
              <button onClick={tryAuto}>
                <strong>Auto</strong>
                <small>R3F WebGL → vgpu WebGPU → CPU Canvas.</small>
              </button>
              <button onClick={tryWebGL} aria-pressed={renderer === "3d"}>
                <strong>R3F WebGL</strong>
                <small>Original renderer. Allows browser-provided software adapters.</small>
              </button>
              <button onClick={useCpuRenderer} aria-pressed={renderer === "2d"}>
                <strong>
                  CPU Canvas <em>RELIABLE FALLBACK</em>
                </strong>
                <small>No WebGL required. Isometric 2D, same physics and missions.</small>
              </button>
              <button onClick={tryVgpu} aria-pressed={renderer === "vgpu"}>
                <strong>
                  vgpu · WebGPU <em>VERCEL LABS · EXPERIMENTAL</em>
                </strong>
                <small>
                  Real vgpu library: WGSL lighting, depth-tested 3D, instancing, and pre-warmed
                  pipelines.
                </small>
              </button>
            </div>
            <div className="renderer-status">
              <small>ACTIVE RENDERER</small>
              <strong>{renderer === "2d" ? CPU_INFO.kind : backend.kind}</strong>
              <code>{renderer === "2d" ? CPU_INFO.name : backend.name}</code>
              {renderer === "3d" && !backend.exposed && (
                <p>
                  Adapter identity is hidden by the browser; physical, software, or virtual status
                  cannot be confirmed.
                </p>
              )}
            </div>
            {rendererNote && (
              <p className="renderer-note" role="status">
                {rendererNote}
              </p>
            )}
            <details className="renderer-details">
              <summary>About vgpu, WebGPU, and CPU rendering</summary>
              <p>
                Canvas 2D remains playable when WebGL is disabled. Software WebGL (such as
                SwiftShader or llvmpipe) runs the actual R3F scene on the CPU, but must be enabled
                and exposed by your browser or host. Software adapters use a lower render resolution
                and no shadow maps.
              </p>
              <p>
                <a href="https://vgpu.sh/" target="_blank" rel="noreferrer">
                  vgpu by Vercel Labs
                </a>{" "}
                is a WebGPU programming library, not a virtual GPU. This experimental backend
                renders the map and car with its own WGSL shaders; R3F remains the original WebGL
                backend. Lighting differs between them.
              </p>
              <p>
                Browser vgpu requires WebGPU. Its Node entry point can use a software Vulkan
                renderer on a CPU; that server-side runtime is separate from your browser. If
                neither WebGL nor WebGPU is exposed here, CPU Canvas remains available.
              </p>
            </details>
            <button className="primary" onClick={closeRendererSettings}>
              BACK TO THE ROAD <span>→</span>
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

class GameErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    game.paused = true;
    game.keys = {};
    window.pinefallDiagnostics?.report("React render failure", error, info.componentStack);
  }
  render() {
    if (this.state.error)
      return (
        <div className="modal-backdrop">
          <section className="modal" role="alert">
            <div className="eyebrow">PINEFALL / RENDER ERROR</div>
            <h2>A bump in the road.</h2>
            <p>
              The game stopped because a rendering error occurred. The error panel contains the
              message and stack trace. Copy the details before reloading.
            </p>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: 12,
                color: "#e9b2a0",
              }}
            >
              {String(this.state.error.message || this.state.error)}
            </pre>
            <button className="primary" onClick={() => window.location.reload()}>
              RELOAD GAME <span>↻</span>
            </button>
          </section>
        </div>
      );
    return this.props.children;
  }
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <GameErrorBoundary>
    <App />
  </GameErrorBoundary>,
);
