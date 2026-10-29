"use client";

import { GrassGround, lotPlacement, Neighborhood, padKeepOut } from "@/components/Neighborhood";
import type { Surroundings } from "@/lib/surroundings";
import { Environment, OrbitControls, Sky } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export type BuildView = "exterior" | "interior";

export type BuildSceneProps = {
  aerial: string | null;
  metersAcross: number;
  units: number;
  stage: number;
  view: BuildView;
  exterior: string[];
  interior: string[];
  surroundings: Surroundings | null;
};

const SUN: [number, number, number] = [70, 100, 46];
const UP = new THREE.Vector3(0, 1, 0);
const HAZE = "#cfdbe3";

const HOUSE_W = 9;
const HOUSE_D = 12;
const STORY = 3;
const GAP = 4;
const PITCH = 0.55;

function houseCount(units: number) {
  if (units <= 2) return 1;
  if (units <= 4) return 2;
  if (units <= 8) return 3;
  return 4;
}

function color(value: string) {
  return new THREE.Color(value);
}

function luminance(value: string) {
  const c = color(value);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function saturation(value: string) {
  const hsl = { h: 0, s: 0, l: 0 };
  color(value).getHSL(hsl);
  return hsl.s * (1 - Math.abs(hsl.l - 0.5) * 1.4);
}

function isSky(value: string) {
  const c = color(value);
  return c.b > c.r + 0.06 && c.b >= c.g - 0.02;
}

function mix(a: string, b: string, t: number) {
  return `#${color(a).lerp(color(b), t).getHexString()}`;
}

export function exteriorRoles(palette: string[]) {
  const usable = palette.filter((value) => !isSky(value));
  const pool = usable.length >= 3 ? usable : ["#e7e1d6", "#3d4248", "#8a5a36", ...usable];
  const byLight = [...pool].sort((a, b) => luminance(b) - luminance(a));
  const wall = mix(byLight[0], "#ffffff", luminance(byLight[0]) < 0.35 ? 0.45 : 0.08);
  const roof = mix(byLight[byLight.length - 1], "#2b2f33", 0.25);
  const accent = [...pool].sort((a, b) => saturation(b) - saturation(a))[0];
  return { wall, roof, trim: mix(wall, "#ffffff", 0.7), door: accent, siding: byLight[Math.min(1, byLight.length - 1)] };
}

export function interiorRoles(palette: string[]) {
  const pool = palette.length >= 3 ? palette : ["#efe9df", "#b08155", "#4a4f55", "#7d8f6a", ...palette];
  const byLight = [...pool].sort((a, b) => luminance(b) - luminance(a));
  const warm = [...pool].sort((a, b) => color(b).r - color(b).b - (color(a).r - color(a).b))[0];
  const accent = [...pool].sort((a, b) => saturation(b) - saturation(a))[0];
  return {
    wall: mix(byLight[0], "#ffffff", 0.35),
    floor: mix(warm, "#8a6040", 0.25),
    sofa: byLight[byLight.length - 1],
    accent,
    rug: mix(byLight[1] ?? byLight[0], accent, 0.25),
    wood: mix(warm, "#5a3a22", 0.35),
  };
}

function padSize(units: number) {
  const count = houseCount(units);
  return { w: count * HOUSE_W + (count - 1) * GAP + 10, d: HOUSE_D + 14 };
}

export default function BuildScene(props: BuildSceneProps) {
  const pad = padSize(props.units);
  const place = useMemo(
    () => (props.surroundings ? lotPlacement(props.surroundings.roads, pad.w, pad.d) : { x: 0, z: 0, angle: 0 }),
    [props.surroundings, pad.w, pad.d],
  );
  const keepOut = useMemo(() => padKeepOut(place, pad.w, pad.d, 2), [place, pad.w, pad.d]);
  const live = Boolean(props.surroundings);

  return (
    <Canvas shadows="soft" dpr={[1, 1]} camera={{ fov: 38, position: [30, 24, 36], near: 1, far: 4000 }} gl={{ antialias: false, powerPreference: "high-performance" }}>
      <color attach="background" args={[HAZE]} />
      <fog attach="fog" args={[HAZE, live ? 170 : 140, live ? 560 : 420]} />
      <Sky distance={2500} sunPosition={SUN} turbidity={5.5} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.82} />
      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={0.45} />
      </Suspense>
      <hemisphereLight args={["#eaf3ff", "#5f7a4c", 0.5]} />
      <Sun wide={live} />
      {props.surroundings ? (
        <>
          <GrassGround />
          <Neighborhood data={props.surroundings} keepOut={keepOut} />
        </>
      ) : (
        <Suspense fallback={<Ground aerial={null} metersAcross={props.metersAcross} />}>
          <Ground aerial={props.aerial} metersAcross={props.metersAcross} />
        </Suspense>
      )}
      <group position={[place.x, 0, place.z]} rotation-y={place.angle}>
        <Lot {...props} />
      </group>
      <Rig view={props.view} units={props.units} center={place} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO halfRes quality="performance" aoRadius={2.4} distanceFalloff={1.2} intensity={2.6} />
        <SMAA />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.32} darkness={0.42} />
      </EffectComposer>
    </Canvas>
  );
}

function Sun({ wide }: { wide: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const reach = wide ? 110 : 45;
  useLayoutEffect(() => {
    const node = light.current;
    if (!node) return;
    node.target.position.set(0, 0, 0);
    node.target.updateMatrixWorld();
    const cam = node.shadow.camera;
    cam.left = -reach;
    cam.right = reach;
    cam.top = reach;
    cam.bottom = -reach;
    cam.updateProjectionMatrix();
  }, [reach]);
  return (
    <directionalLight
      ref={light}
      position={SUN}
      intensity={3.1}
      color="#fff4e6"
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-near={10}
      shadow-camera-far={420}
      shadow-bias={-0.0003}
      shadow-normalBias={0.05}
    />
  );
}

function Ground({ aerial, metersAcross }: { aerial: string | null; metersAcross: number }) {
  return aerial ? <AerialGround url={aerial} size={metersAcross} /> : <PlainGround size={metersAcross} />;
}

function AerialGround({ url, size }: { url: string; size: number }) {
  const texture = useLoader(THREE.TextureLoader, url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial map={texture} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]}>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#7f9a68" roughness={1} />
      </mesh>
    </>
  );
}

function PlainGround({ size }: { size: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[size * 4, size * 4]} />
      <meshStandardMaterial color="#7f9a68" roughness={1} />
    </mesh>
  );
}

function Rig({ view, units, center }: { view: BuildView; units: number; center: { x: number; z: number; angle: number } }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const flying = useRef(1.4);
  const lastView = useRef("");
  const span = houseCount(units) * (HOUSE_W + GAP);

  useFrame((_, delta) => {
    const key = `${view}:${center.x}:${center.z}:${center.angle}`;
    if (lastView.current !== key) {
      lastView.current = key;
      flying.current = 1.4;
    }
    const orbit = controls.current;
    if (!orbit || flying.current <= 0) return;
    flying.current -= delta;
    const local =
      view === "interior" ? new THREE.Vector3(span * 0.25, 20 + span * 0.25, 16 + span * 0.2) : new THREE.Vector3(18 + span * 0.6, 14 + span * 0.25, 26 + span * 0.6);
    const position = local.applyAxisAngle(UP, center.angle).add(new THREE.Vector3(center.x, 0, center.z));
    const target = new THREE.Vector3(center.x, view === "interior" ? 0 : 3, center.z);
    camera.position.lerp(position, 0.07);
    orbit.target.lerp(target, 0.07);
    orbit.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      minDistance={10}
      maxDistance={260}
      maxPolarAngle={1.45}
      onStart={() => {
        flying.current = 0;
      }}
    />
  );
}

function Lot(props: BuildSceneProps) {
  const count = houseCount(props.units);
  const stories = props.units > count ? 2 : 1;
  const shown = useRef(props.stage);
  const group = useRef<THREE.Group>(null);
  const width = count * HOUSE_W + (count - 1) * GAP;
  const ext = useMemo(() => exteriorRoles(props.exterior), [props.exterior]);
  const int = useMemo(() => interiorRoles(props.interior), [props.interior]);
  const xs = Array.from({ length: count }, (_, index) => -width / 2 + HOUSE_W / 2 + index * (HOUSE_W + GAP));

  const stageRef = useRef({ value: props.stage });
  useFrame((_, delta) => {
    shown.current += (props.stage - shown.current) * Math.min(1, delta * 3.2);
    stageRef.current.value = shown.current;
  });

  return (
    <group ref={group}>
      <DirtPad width={width + 10} depth={HOUSE_D + 14} />
      <SiteKit width={width} stage={stageRef} />
      {xs.map((x, index) => (
        <House key={x} x={x} flip={index % 2 === 1} stories={stories} stage={stageRef} view={props.view} ext={ext} int={int} />
      ))}
    </group>
  );
}

function DirtPad({ width, depth }: { width: number; depth: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#a2835f";
      ctx.fillRect(0, 0, 256, 256);
      const tones = ["rgba(70,50,30,0.18)", "rgba(255,240,220,0.14)", "rgba(120,95,65,0.25)", "rgba(60,45,30,0.3)"];
      for (let i = 0; i < 7000; i += 1) {
        ctx.fillStyle = tones[i % tones.length];
        const size = Math.random() < 0.04 ? 3 + Math.random() * 3 : 1 + Math.random() * 1.5;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, size, size);
      }
      ctx.strokeStyle = "rgba(60,42,25,0.22)";
      ctx.lineWidth = 3;
      for (let y = 20; y < 256; y += 38) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(80, y + 6, 170, y - 6, 256, y);
        ctx.stroke();
      }
    }
    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.repeat.set(width / 6, depth / 6);
    return map;
  }, [width, depth]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial map={texture} roughness={1} />
    </mesh>
  );
}

type StageRef = { current: { value: number } };
type Ext = ReturnType<typeof exteriorRoles>;
type Int = ReturnType<typeof interiorRoles>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function useGrow(stage: StageRef, from: number, axis: "y" | "all" = "y") {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const node = ref.current;
    if (!node) return;
    const t = clamp01(stage.current.value - from);
    const eased = t * t * (3 - 2 * t);
    node.visible = eased > 0.01;
    if (axis === "y") node.scale.set(1, Math.max(0.001, eased), 1);
    else node.scale.setScalar(Math.max(0.001, eased));
  });
  return ref;
}

function SiteKit({ width, stage }: { width: number; stage: StageRef }) {
  const fence = useRef<THREE.Group>(null);
  useFrame(() => {
    if (fence.current) fence.current.visible = stage.current.value < 2.85;
  });
  const w = width + 9;
  const d = HOUSE_D + 13;
  const posts: [number, number][] = [];
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 2.5) posts.push([x, -d / 2], [x, d / 2]);
  for (let z = -d / 2 + 2.5; z < d / 2; z += 2.5) posts.push([-w / 2, z], [w / 2, z]);
  return (
    <group ref={fence}>
      {posts.map(([x, z]) => (
        <mesh key={`${x.toFixed(1)}-${z.toFixed(1)}`} position={[x, 0.9, z]} castShadow>
          <boxGeometry args={[0.08, 1.8, 0.08]} />
          <meshStandardMaterial color="#9aa2a8" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {[-d / 2, d / 2].map((z) => (
        <mesh key={`rail-${z}`} position={[0, 1.2, z]}>
          <boxGeometry args={[w, 0.9, 0.02]} />
          <meshStandardMaterial color="#d9772b" transparent opacity={0.55} />
        </mesh>
      ))}
      {[-w / 2, w / 2].map((x) => (
        <mesh key={`side-${x}`} position={[x, 1.2, 0]}>
          <boxGeometry args={[0.02, 0.9, d]} />
          <meshStandardMaterial color="#d9772b" transparent opacity={0.55} />
        </mesh>
      ))}
      <group position={[w / 2 - 3, 0, d / 2 - 3]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 0.12 + i * 0.2, 0]} castShadow>
            <boxGeometry args={[3.6, 0.18, 1.1]} />
            <meshStandardMaterial color={i % 2 ? "#c99a63" : "#b98a55"} roughness={0.8} />
          </mesh>
        ))}
      </group>
      <mesh position={[-w / 2 + 2, 1.1, -d / 2 + 2]} castShadow>
        <boxGeometry args={[1.2, 2.2, 1.2]} />
        <meshStandardMaterial color="#2f6fb5" roughness={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 3, 0.35, d / 2 + 1.4]} castShadow>
          <coneGeometry args={[0.28, 0.7, 12]} />
          <meshStandardMaterial color="#f06a1d" />
        </mesh>
      ))}
    </group>
  );
}

function House({
  x,
  flip,
  stories,
  stage,
  view,
  ext,
  int,
}: {
  x: number;
  flip: boolean;
  stories: number;
  stage: StageRef;
  view: BuildView;
  ext: Ext;
  int: Int;
}) {
  const slab = useGrow(stage, 0);
  const frame = useGrow(stage, 1);
  const finish = useGrow(stage, 2);
  const frameHide = useRef<THREE.Group>(null);
  useFrame(() => {
    if (frameHide.current) frameHide.current.visible = stage.current.value < 2.9;
  });
  const cut = view === "interior";
  const height = stories * STORY;

  return (
    <group position={[x, 0, 0]} rotation={[0, flip ? Math.PI : 0, 0]}>
      <group ref={slab}>
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[HOUSE_W + 0.4, 0.4, HOUSE_D + 0.4]} />
          <meshStandardMaterial color="#c9c5bd" roughness={0.9} />
        </mesh>
      </group>
      <group ref={frameHide}>
        <group ref={frame} position={[0, 0.4, 0]}>
          <Framing stories={stories} />
        </group>
      </group>
      <group ref={finish} position={[0, 0.4, 0]}>
        <Shell height={height} stories={stories} ext={ext} cut={cut} />
        {cut ? <Interior int={int} /> : <Roof height={height} ext={ext} />}
      </group>
    </group>
  );
}

function Framing({ stories }: { stories: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const studs = useMemo(() => {
    const items: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    const add = (px: number, py: number, pz: number, sx: number, sy: number, sz: number, rz = 0) => {
      dummy.position.set(px, py, pz);
      dummy.rotation.set(0, 0, rz);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      items.push(dummy.matrix.clone());
    };
    for (let level = 0; level < stories; level += 1) {
      const base = level * STORY;
      for (let px = -HOUSE_W / 2; px <= HOUSE_W / 2 + 0.01; px += 0.6) {
        add(px, base + STORY / 2, -HOUSE_D / 2, 0.06, STORY, 0.14);
        add(px, base + STORY / 2, HOUSE_D / 2, 0.06, STORY, 0.14);
      }
      for (let pz = -HOUSE_D / 2 + 0.6; pz < HOUSE_D / 2; pz += 0.6) {
        add(-HOUSE_W / 2, base + STORY / 2, pz, 0.14, STORY, 0.06);
        add(HOUSE_W / 2, base + STORY / 2, pz, 0.14, STORY, 0.06);
      }
      add(0, base + STORY, -HOUSE_D / 2, HOUSE_W, 0.12, 0.16);
      add(0, base + STORY, HOUSE_D / 2, HOUSE_W, 0.12, 0.16);
      add(-HOUSE_W / 2, base + STORY, 0, 0.16, 0.12, HOUSE_D);
      add(HOUSE_W / 2, base + STORY, 0, 0.16, 0.12, HOUSE_D);
    }
    const top = stories * STORY;
    const rise = (HOUSE_W / 2) * PITCH;
    const rafter = Math.hypot(HOUSE_W / 2, rise);
    for (let pz = -HOUSE_D / 2; pz <= HOUSE_D / 2 + 0.01; pz += 0.9) {
      add(-HOUSE_W / 4, top + rise / 2, pz, rafter, 0.1, 0.06, Math.atan2(rise, HOUSE_W / 2));
      add(HOUSE_W / 4, top + rise / 2, pz, rafter, 0.1, 0.06, -Math.atan2(rise, HOUSE_W / 2));
      add(0, top, pz, HOUSE_W, 0.08, 0.06);
    }
    add(0, top + rise, 0, 0.1, 0.12, HOUSE_D);
    return items;
  }, [stories]);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d9b27c", roughness: 0.75 }), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    studs.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
  }, [studs]);
  return <instancedMesh ref={ref} args={[geometry, material, studs.length]} castShadow receiveShadow />;
}

function Shell({ height, stories, ext, cut }: { height: number; stories: number; ext: Ext; cut: boolean }) {
  const wallH = cut ? 1.3 : height;
  const t = 0.22;
  const windows: [number, number, number, number][] = [];
  if (!cut) {
    for (let level = 0; level < stories; level += 1) {
      const y = level * STORY + 1.65;
      for (const wx of [-2.6, 0, 2.6]) {
        if (level === 0 && wx === 0) continue;
        windows.push([wx, y, HOUSE_D / 2 + t / 2, 0]);
      }
      for (const wx of [-2.6, 2.6]) windows.push([wx, y, -HOUSE_D / 2 - t / 2, Math.PI]);
      for (const wz of [-3.4, 0.4, 3.6]) {
        windows.push([HOUSE_W / 2 + t / 2, y, wz, Math.PI / 2]);
        windows.push([-HOUSE_W / 2 - t / 2, y, wz, -Math.PI / 2]);
      }
    }
  }
  return (
    <group>
      {[
        [0, HOUSE_D / 2, HOUSE_W + t, t],
        [0, -HOUSE_D / 2, HOUSE_W + t, t],
      ].map(([wx, wz, sx, sz]) => (
        <mesh key={`wz-${wz}`} position={[wx, wallH / 2, wz]} castShadow receiveShadow>
          <boxGeometry args={[sx, wallH, sz]} />
          <meshStandardMaterial color={ext.wall} roughness={0.85} />
        </mesh>
      ))}
      {[HOUSE_W / 2, -HOUSE_W / 2].map((wx) => (
        <mesh key={`wx-${wx}`} position={[wx, wallH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[t, wallH, HOUSE_D]} />
          <meshStandardMaterial color={ext.wall} roughness={0.85} />
        </mesh>
      ))}
      {!cut && stories > 1 ? (
        <mesh position={[0, STORY, 0]}>
          <boxGeometry args={[HOUSE_W + t + 0.12, 0.22, HOUSE_D + t + 0.12]} />
          <meshStandardMaterial color={ext.trim} roughness={0.6} />
        </mesh>
      ) : null}
      {!cut ? (
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[HOUSE_W + t + 0.1, 0.24, HOUSE_D + t + 0.1]} />
          <meshStandardMaterial color={ext.siding} roughness={0.9} />
        </mesh>
      ) : null}
      {windows.map(([wx, wy, wz, ry]) => (
        <group key={`${wx}-${wy}-${wz}`} position={[wx, wy, wz]} rotation={[0, ry, 0]}>
          <mesh>
            <boxGeometry args={[1.5, 1.6, 0.06]} />
            <meshStandardMaterial color={ext.trim} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[1.3, 1.4, 0.04]} />
            <meshPhysicalMaterial color="#9fc2d6" roughness={0.05} metalness={0.2} envMapIntensity={1.4} />
          </mesh>
        </group>
      ))}
      {!cut ? (
        <group position={[0, 0, HOUSE_D / 2 + t / 2]}>
          <mesh position={[0, 1.15, 0.03]}>
            <boxGeometry args={[1.2, 2.3, 0.08]} />
            <meshStandardMaterial color={ext.door} roughness={0.5} />
          </mesh>
          <mesh position={[0, 2.5, 0.6]} castShadow>
            <boxGeometry args={[2.4, 0.12, 1.3]} />
            <meshStandardMaterial color={ext.trim} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.1, 0.9]} receiveShadow>
            <boxGeometry args={[2.4, 0.2, 1.4]} />
            <meshStandardMaterial color="#cfcac0" roughness={0.9} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function Roof({ height, ext }: { height: number; ext: Ext }) {
  const rise = (HOUSE_W / 2) * PITCH;
  const slope = Math.hypot(HOUSE_W / 2 + 0.6, rise + 0.3);
  const angle = Math.atan2(rise, HOUSE_W / 2);
  const gable = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-HOUSE_W / 2, 0);
    shape.lineTo(HOUSE_W / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [rise]);
  return (
    <group position={[0, height, 0]}>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[(side * HOUSE_W) / 4, rise / 2 + 0.05, 0]}
          rotation={[0, 0, -side * angle]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[slope, 0.18, HOUSE_D + 1]} />
          <meshStandardMaterial color={ext.roof} roughness={0.75} />
        </mesh>
      ))}
      {[HOUSE_D / 2 + 0.11, -HOUSE_D / 2 - 0.11].map((z) => (
        <mesh key={z} geometry={gable} position={[0, 0, z]} rotation={[0, z > 0 ? 0 : Math.PI, 0]}>
          <meshStandardMaterial color={ext.wall} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Interior({ int }: { int: Int }) {
  const W = HOUSE_W - 0.3;
  const D = HOUSE_D - 0.3;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={int.floor} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.65, -0.6]} castShadow>
        <boxGeometry args={[W, 1.3, 0.12]} />
        <meshStandardMaterial color={int.wall} roughness={0.9} />
      </mesh>
      <mesh position={[-1.2, 0.65, -3.4]} castShadow>
        <boxGeometry args={[0.12, 1.3, 5.4]} />
        <meshStandardMaterial color={int.wall} roughness={0.9} />
      </mesh>
      {/* Living room */}
      <mesh rotation-x={-Math.PI / 2} position={[-0.6, 0.03, 3]} receiveShadow>
        <planeGeometry args={[4.2, 3]} />
        <meshStandardMaterial color={int.rug} roughness={1} />
      </mesh>
      <group position={[-0.6, 0, 4.3]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[3, 0.5, 0.95]} />
          <meshStandardMaterial color={int.sofa} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.65, 0.38]} castShadow>
          <boxGeometry args={[3, 0.5, 0.2]} />
          <meshStandardMaterial color={int.sofa} roughness={0.85} />
        </mesh>
      </group>
      <mesh position={[-0.6, 0.22, 2.6]} castShadow>
        <boxGeometry args={[1.4, 0.44, 0.8]} />
        <meshStandardMaterial color={int.wood} roughness={0.6} />
      </mesh>
      <mesh position={[-0.6, 0.6, 0.1]} castShadow>
        <boxGeometry args={[1.8, 1.0, 0.25]} />
        <meshStandardMaterial color={int.wood} roughness={0.6} />
      </mesh>
      {/* Kitchen and dining */}
      <mesh position={[3.4, 0.45, 2.4]} castShadow>
        <boxGeometry args={[1.2, 0.9, 4.2]} />
        <meshStandardMaterial color={int.wall} roughness={0.5} />
      </mesh>
      <mesh position={[3.4, 0.92, 2.4]}>
        <boxGeometry args={[1.25, 0.05, 4.25]} />
        <meshStandardMaterial color={int.accent} roughness={0.3} />
      </mesh>
      <group position={[1.9, 0, -0.1 + 1.6]}>
        <mesh position={[0, 0.75, 0]} castShadow>
          <boxGeometry args={[1, 0.06, 1.8]} />
          <meshStandardMaterial color={int.wood} roughness={0.5} />
        </mesh>
        {[-0.6, 0.6].map((z) => (
          <mesh key={z} position={[0, 0.37, z]} castShadow>
            <boxGeometry args={[0.8, 0.74, 0.08]} />
            <meshStandardMaterial color={int.wood} roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* Bedroom */}
      <group position={[-2.6, 0, -3.6]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[1.9, 0.56, 2.2]} />
          <meshStandardMaterial color={int.wall} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.6, -0.4]} castShadow>
          <boxGeometry args={[1.9, 0.1, 1.2]} />
          <meshStandardMaterial color={int.accent} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.7, 1.05]} castShadow>
          <boxGeometry args={[1.9, 0.9, 0.1]} />
          <meshStandardMaterial color={int.wood} roughness={0.6} />
        </mesh>
      </group>
      {/* Bath */}
      <group position={[2.4, 0, -3.6]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
          <planeGeometry args={[3.6, 4.4]} />
          <meshStandardMaterial color="#e8ecef" roughness={0.3} />
        </mesh>
        <mesh position={[0.9, 0.3, -1.3]} castShadow>
          <boxGeometry args={[1.6, 0.6, 0.8]} />
          <meshStandardMaterial color="#ffffff" roughness={0.2} />
        </mesh>
        <mesh position={[-1.1, 0.45, 1.4]} castShadow>
          <boxGeometry args={[1.0, 0.9, 0.55]} />
          <meshStandardMaterial color={int.wood} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}
