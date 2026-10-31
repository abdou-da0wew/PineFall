import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { trees, rocks } from "./worldData";
import { getGraphics, spatialCells, useGraphics } from "./graphicsSettings";
import type { Tree } from "./types";
export const LANDMARKS = [
  { x: 5, z: 33, name: "SOUTHBOUND DEPOT", color: "#e9c679" },
  { x: -31, z: -30, name: "JUNIPER OBSERVATORY", color: "#a6e4cf" },
  { x: 31, z: -29, name: "MOSSWOOD", color: "#cbb68d" },
  { x: 30, z: 32, name: "RANGER STATION", color: "#c5d7b5" },
];
export const SCENERY = [
  ...LANDMARKS.map((p) => ({ ...p, kind: "sign" as const })),
  { x: -12, z: 39, kind: "bench" as const, color: "#a48963", name: "" },
  { x: 28, z: 39, kind: "bench" as const, color: "#a48963", name: "" },
  { x: 43, z: -24, kind: "mailbox" as const, color: "#a86e54", name: "" },
  { x: -24, z: 17, kind: "mailbox" as const, color: "#6f9b91", name: "" },
  { x: 14, z: 16, kind: "camp" as const, color: "#b99a69", name: "" },
];
const cells = spatialCells(trees, 18);
function Forest({ focus }: { focus: () => { x: number; z: number } }) {
  const settings = useGraphics();
  return (
    <>
      {cells.map((cell, i) => (
        <TreeCell key={i} cell={cell} focus={focus} enabled={settings.culling} />
      ))}
    </>
  );
}
function TreeCell({
  cell,
  focus,
  enabled,
}: {
  cell: { x: number; z: number; items: Tree[] };
  focus: () => { x: number; z: number };
  enabled: boolean;
}) {
  const trunk = useRef<THREE.InstancedMesh>(null!),
    leaves = useRef<THREE.InstancedMesh>(null!),
    group = useRef<THREE.Group>(null!);
  const near = useRef(true);
  const timer = useRef(0);
  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    return cell.items.map((t, i) => {
      const layers = [];
      for (let l = 0; l < 3; l++) {
        dummy.position.set(t.x, (2.5 + l * 1.35) * t.s, t.z);
        dummy.scale.set((2.15 - l * 0.45) * t.s, (3 - l * 0.25) * t.s, (2.15 - l * 0.45) * t.s);
        dummy.rotation.y = i * 0.9;
        dummy.updateMatrix();
        layers.push(dummy.matrix.clone());
      }
      return layers;
    });
  }, [cell]);
  useEffect(() => {
    const dummy = new THREE.Object3D(),
      color = new THREE.Color();
    cell.items.forEach((t, i) => {
      dummy.position.set(t.x, t.s * 1.6, t.z);
      dummy.scale.set(0.38 * t.s, 3.2 * t.s, 0.38 * t.s);
      dummy.updateMatrix();
      trunk.current.setMatrixAt(i, dummy.matrix);
      for (let l = 0; l < 3; l++) {
        leaves.current.setMatrixAt(i * 3 + l, matrices[i][l]);
        color.set(["#294c48", "#355b50", "#406656", "#2e534d"][i % 4]).multiplyScalar(1 + l * 0.09);
        leaves.current.setColorAt(i * 3 + l, color);
      }
    });
    trunk.current.instanceMatrix.needsUpdate = true;
    leaves.current.instanceMatrix.needsUpdate = true;
    trunk.current.computeBoundingSphere();
    leaves.current.computeBoundingSphere();
    near.current = true;
  }, [cell, matrices]);
  useFrame((_state, dt) => {
    timer.current += dt;
    if (timer.current < 0.15) return;
    timer.current = 0;
    const s = getGraphics(),
      p = focus(),
      distance = Math.hypot(p.x - cell.x, p.z - cell.z);
    group.current.visible = !enabled || distance < s.drawDistance + 16;
    if (!group.current.visible) return;
    const detail = distance < s.lodDistance + (near.current ? 5 : 0);
    if (detail === near.current) return;
    near.current = detail;
    let index = 0;
    for (let i = 0; i < matrices.length; i++)
      for (let l = detail ? 0 : 1; l < 3; l++) leaves.current.setMatrixAt(index++, matrices[i][l]);
    leaves.current.count = index;
    leaves.current.instanceMatrix.needsUpdate = true;
    leaves.current.computeBoundingSphere();
  });
  return (
    <group ref={group}>
      <instancedMesh ref={trunk} args={[undefined, undefined, cell.items.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#554e46" />
      </instancedMesh>
      <instancedMesh
        ref={leaves}
        args={[undefined, undefined, cell.items.length * 3]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
    </group>
  );
}
export function BatchedRocks() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    const dummy = new THREE.Object3D();
    rocks.forEach((r, i) => {
      dummy.position.set(r.x, r.s * 0.25, r.z);
      dummy.rotation.y = i;
      dummy.scale.set(r.s, r.s * 0.65, r.s);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, rocks.length]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#849284" flatShading />
    </instancedMesh>
  );
}
export function RoadMarkings() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const v of [-36, 0, 36])
      for (let n = 0; n < 20; n++)
        for (const axis of [0, 1]) {
          dummy.position.set(axis ? -38 + n * 4 : v, axis ? 0.1 : 0.08, axis ? v : -38 + n * 4);
          dummy.scale.set(axis ? 1.6 : 0.12, 0.015, axis ? 0.12 : 1.6);
          dummy.updateMatrix();
          ref.current.setMatrixAt(i++, dummy.matrix);
        }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 120]}>
      <boxGeometry />
      <meshStandardMaterial color="#a8aa87" />
    </instancedMesh>
  );
}
export function Scenery({ focus }: { focus: () => { x: number; z: number } }) {
  const s = useGraphics();
  if (!s.scenery) return null;
  return (
    <>
      {SCENERY.map((prop, i) => (
        <SceneryProp key={i} prop={prop} focus={focus} />
      ))}
    </>
  );
}
function SceneryProp({
  prop,
  focus,
}: {
  prop: (typeof SCENERY)[number];
  focus: () => { x: number; z: number };
}) {
  const group = useRef<THREE.Group>(null!);
  useFrame(() => {
    const s = getGraphics(),
      p = focus();
    group.current.visible = !s.culling || Math.hypot(p.x - prop.x, p.z - prop.z) < s.drawDistance;
  });
  return (
    <group ref={group} position={[prop.x, 0, prop.z]}>
      {prop.kind === "sign" ? (
        <>
          <mesh position={[0, 1.1, 0]}>
            <boxGeometry args={[0.18, 2.2, 0.18]} />
            <meshStandardMaterial color="#6e6856" />
          </mesh>
          <mesh position={[0, 2.1, 0]}>
            <boxGeometry args={[3, 0.65, 0.15]} />
            <meshStandardMaterial color={prop.color} />
          </mesh>
          <mesh position={[1.65, 2.1, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.45, 0.65, 3]} />
            <meshStandardMaterial color={prop.color} />
          </mesh>
        </>
      ) : prop.kind === "bench" ? (
        <>
          <mesh position={[0, 0.65, 0]}>
            <boxGeometry args={[2.6, 0.18, 0.9]} />
            <meshStandardMaterial color={prop.color} />
          </mesh>
          <mesh position={[0, 1.2, 0.45]}>
            <boxGeometry args={[2.6, 0.7, 0.15]} />
            <meshStandardMaterial color={prop.color} />
          </mesh>
        </>
      ) : prop.kind === "mailbox" ? (
        <>
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[0.2, 1.4, 0.2]} />
            <meshStandardMaterial color="#605b4e" />
          </mesh>
          <mesh position={[0, 1.4, 0]}>
            <boxGeometry args={[0.9, 0.6, 0.65]} />
            <meshStandardMaterial color={prop.color} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 0.8, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[2, 1.6, 4]} />
          <meshStandardMaterial color={prop.color} flatShading />
        </mesh>
      )}
    </group>
  );
}
export function ChimneySmoke() {
  const settings = useGraphics();
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => new Float32Array(18 * 3), []);
  useFrame(({ clock }) => {
    if (!settings.ambient) return;
    const t = clock.elapsedTime;
    const attribute = ref.current.geometry.getAttribute("position");
    for (let i = 0; i < 18; i++) {
      const age = (t * 0.15 + i / 18) % 1;
      attribute.setXYZ(i, -5 + Math.sin(i * 3 + age) * age * 1.3, 6 + age * 5, 42 + age * 1.5);
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });
  return settings.ambient ? (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#93a29b" transparent opacity={0.14} size={0.7} depthWrite={false} />
    </points>
  ) : null;
}

export const OptimizedForest = memo(Forest);
