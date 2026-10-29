"use client";

import { Environment, MeshReflectorMaterial, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

const YELLOW = "#f0a000";
const YELLOW_DARK = "#d4840a";
const STEEL = "#c5ced6";
const CONCRETE = "#d5cfc3";
const DIRT = "#7b5a3c";
const GLASS = "#b7dff0";

type ProgressRef = { current: number };

export default function SiteCanvas({ progress }: { progress: number }) {
  const progressRef = useRef(progress);
  progressRef.current = progress;
  return (
    <Canvas
      className="site-canvas"
      shadows="soft"
      dpr={[1, 1.75]}
      camera={{ fov: 38, position: [-1, 2.8, 22], near: 0.1, far: 400 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.12 }}
    >
      <SkyDome />
      <fog attach="fog" args={["#6ea4d4", 120, 260]} />
      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={0.45} />
      </Suspense>
      <hemisphereLight args={["#e7f4ff", "#5f8a48", 0.42]} />
      <ambientLight intensity={0.08} />
      <Sun />
      <Clouds />
      <Site />
      <Rig progressRef={progressRef} />
    </Canvas>
  );
}

function Sun() {
  const light = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const sun = light.current;
    if (!sun) return;
    sun.target.position.set(5, 0, -2);
    sun.target.updateMatrixWorld();
  }, []);
  return (
    <directionalLight
      ref={light}
      position={[22, 34, 12]}
      intensity={3.6}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-near={10}
      shadow-camera-far={80}
      shadow-camera-left={-26}
      shadow-camera-right={26}
      shadow-camera-top={26}
      shadow-camera-bottom={-26}
      shadow-bias={-0.00015}
      shadow-normalBias={0.02}
    />
  );
}

function Rig({ progressRef }: { progressRef: ProgressRef }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const dragging = useRef(false);
  const holding = useRef(false);
  const lastProgress = useRef(0);
  const fine = useMemo(() => window.matchMedia("(pointer: fine)").matches, []);

  useFrame((state) => {
    const orbit = controls.current;
    if (!orbit || dragging.current) return;
    const progress = progressRef.current;
    if (Math.abs(progress - lastProgress.current) > 0.0015) {
      holding.current = false;
      lastProgress.current = progress;
    }
    if (holding.current) return;
    const shot = cameraPath(progress);
    state.camera.position.lerp(shot.position, 0.08);
    orbit.target.lerp(shot.target, 0.08);
    orbit.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enableZoom={false}
      enablePan={false}
      enableRotate={fine}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.7}
      maxPolarAngle={2.15}
      minAzimuthAngle={-1.35}
      maxAzimuthAngle={0.35}
      onStart={() => {
        dragging.current = true;
      }}
      onEnd={() => {
        dragging.current = false;
        holding.current = true;
      }}
    />
  );
}

function cameraPath(progress: number) {
  const eased = progress * progress * (3 - 2 * progress);
  return {
    position: new THREE.Vector3(
      THREE.MathUtils.lerp(-1, 4, eased),
      THREE.MathUtils.lerp(2.8, 26, eased),
      THREE.MathUtils.lerp(22, 30, eased),
    ),
    target: new THREE.Vector3(
      THREE.MathUtils.lerp(9, 3, eased),
      THREE.MathUtils.lerp(14, 8, eased),
      THREE.MathUtils.lerp(-1, 0, eased),
    ),
  };
}

function Site() {
  const lawn = useMemo(() => paintLawn(), []);
  const pad = useMemo(() => paintTexture("#c9c3b6", "#a9a396", "#ded8cc"), []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[4, 0, 1]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial map={lawn} roughness={1} metalness={0} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[2.2, 0.02, -0.4]} receiveShadow>
        <planeGeometry args={[16, 13]} />
        <meshStandardMaterial map={pad} roughness={0.92} metalness={0.02} />
      </mesh>
      <Building />
      <Crane />
      <Excavator position={[-8.5, 0, 6.2]} />
      <Truck position={[7.2, 0, 8.4]} />
      <Trailer position={[-6.2, 0, 9.2]} />
      <Lumber position={[-1.2, 0, 5.6]} />
      <Cooler position={[4.8, 0, 6.8]} />
      <Spool position={[-4.2, 0, 7.4]} />
      <Fence />
      <Cones />
      <Pond />
      <Shrubs />
    </group>
  );
}

function paintLawn() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (!ctx) return texture;
  ctx.fillStyle = "#5c9844";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3200; i += 1) {
    ctx.fillStyle = i % 3 === 0 ? "#7dba5e" : "#3e7834";
    ctx.globalAlpha = 0.1 + Math.random() * 0.16;
    const size = 1 + Math.random() * 2.4;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, size, size * (0.45 + Math.random() * 0.7));
  }
  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#6eae54" : "#4a863a";
    ctx.globalAlpha = 0.07;
    ctx.beginPath();
    ctx.ellipse(
      Math.random() * 512,
      Math.random() * 512,
      24 + Math.random() * 40,
      16 + Math.random() * 26,
      Math.random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return texture;
}

function paintTexture(base: string, dark: string, light: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1600; i += 1) {
    ctx.fillStyle = i % 4 === 0 ? light : dark;
    ctx.globalAlpha = 0.35 + Math.random() * 0.5;
    const size = 2 + Math.random() * 10;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 512, Math.random() * 512, size, size * 0.6, Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Building() {
  const floors = 4;
  const story = 3.35;
  const xs = [-5.2, -1.7, 1.8, 5.3];
  const zs = [-4.2, 0, 4.2];
  return (
    <group position={[6.2, 0, -0.6]}>
      {xs.map((x) =>
        zs.map((z) => (
          <mesh key={`${x}-${z}`} position={[x, (floors * story) / 2, z]} castShadow receiveShadow>
            <boxGeometry args={[0.42, floors * story, 0.42]} />
            <meshStandardMaterial color={STEEL} metalness={0.22} roughness={0.42} />
          </mesh>
        )),
      )}
      {Array.from({ length: floors }, (_, floor) => {
        const y = (floor + 1) * story;
        return (
          <group key={floor}>
            {xs.slice(0, -1).map((x, index) =>
              zs.map((z) => (
                <mesh key={`bx-${floor}-${index}-${z}`} position={[(x + xs[index + 1]) / 2, y, z]} castShadow>
                  <boxGeometry args={[xs[index + 1] - x, 0.28, 0.28]} />
                  <meshStandardMaterial color={STEEL} metalness={0.22} roughness={0.4} />
                </mesh>
              )),
            )}
            {zs.slice(0, -1).map((z, index) =>
              xs.map((x) => (
                <mesh key={`bz-${floor}-${index}-${x}`} position={[x, y, (z + zs[index + 1]) / 2]} castShadow>
                  <boxGeometry args={[0.28, 0.28, zs[index + 1] - z]} />
                  <meshStandardMaterial color={STEEL} metalness={0.22} roughness={0.4} />
                </mesh>
              )),
            )}
            {floor < floors - 2 ? (
              <mesh position={[0.2, y - 0.16, 0]} receiveShadow castShadow>
                <boxGeometry args={[11.2, 0.12, 9.2]} />
                <meshStandardMaterial color="#ece7dc" roughness={0.9} metalness={0.02} />
              </mesh>
            ) : null}
          </group>
        );
      })}
      <mesh position={[-5.45, 6.4, 0]} castShadow>
        <boxGeometry args={[0.06, 8.2, 8.6]} />
        <meshStandardMaterial color="#2f6fbf" transparent opacity={0.28} roughness={0.4} metalness={0.1} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-3.4 + i * 0.42, floors * story + 0.55, -2.4]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 1.1, 6]} />
          <meshStandardMaterial color="#d1611e" roughness={0.45} metalness={0.4} />
        </mesh>
      ))}
      <Person position={[-2.4, 0, 5.4]} rotationY={0.6} load="toolbox" />
      <Person position={[3.6, 0, 5.6]} rotationY={-0.8} load="none" />
      <Person position={[1.6, floors * story, 1.15]} rotationY={-0.2} load="plank" scale={1.35} />
      <Ladder />
    </group>
  );
}

function Person({
  position,
  rotationY = 0,
  load = "plank",
  scale = 1,
}: {
  position: [number, number, number];
  rotationY?: number;
  load?: "plank" | "toolbox" | "none";
  scale?: number;
}) {
  const skin = "#e0b08a";
  const denim = "#2c3d55";
  const vest = "#f08a12";
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <mesh position={[-0.11, 0.07, 0.05]} castShadow>
        <boxGeometry args={[0.16, 0.12, 0.28]} />
        <meshStandardMaterial color="#1b1e22" roughness={0.75} />
      </mesh>
      <mesh position={[0.11, 0.07, 0.05]} castShadow>
        <boxGeometry args={[0.16, 0.12, 0.28]} />
        <meshStandardMaterial color="#1b1e22" roughness={0.75} />
      </mesh>
      <mesh position={[-0.1, 0.46, 0]} castShadow>
        <capsuleGeometry args={[0.075, 0.46, 4, 8]} />
        <meshStandardMaterial color={denim} roughness={0.72} />
      </mesh>
      <mesh position={[0.1, 0.46, 0]} castShadow>
        <capsuleGeometry args={[0.075, 0.46, 4, 8]} />
        <meshStandardMaterial color={denim} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.86, 0]} castShadow>
        <boxGeometry args={[0.4, 0.16, 0.22]} />
        <meshStandardMaterial color={denim} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.16, 0]} castShadow>
        <boxGeometry args={[0.42, 0.46, 0.24]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.65} />
      </mesh>
      <mesh position={[0, 1.16, 0.02]} castShadow>
        <boxGeometry args={[0.36, 0.4, 0.22]} />
        <meshStandardMaterial color={vest} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.22, 0.14]}>
        <boxGeometry args={[0.38, 0.06, 0.02]} />
        <meshStandardMaterial color="#f2d34a" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.46, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.1, 8]} />
        <meshStandardMaterial color={skin} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.64, 0.02]} castShadow>
        <sphereGeometry args={[0.15, 16, 14]} />
        <meshStandardMaterial color={skin} roughness={0.62} />
      </mesh>
      <mesh position={[-0.05, 1.66, 0.12]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshStandardMaterial color="#1c2430" roughness={0.3} />
      </mesh>
      <mesh position={[0.05, 1.66, 0.12]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshStandardMaterial color="#1c2430" roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <sphereGeometry args={[0.17, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.65]} />
        <meshStandardMaterial color="#f4f7fb" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.69, 0.12]} rotation={[0.55, 0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.04, 0.18]} />
        <meshStandardMaterial color="#f4f7fb" roughness={0.4} />
      </mesh>
      <mesh position={[-0.28, 1.05, 0]} rotation={[0, 0, 0.35]} castShadow>
        <capsuleGeometry args={[0.055, 0.34, 4, 8]} />
        <meshStandardMaterial color={vest} roughness={0.55} />
      </mesh>
      <mesh position={[-0.4, 0.82, 0.04]} castShadow>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
      {load === "plank" ? (
        <group>
          <mesh position={[0.24, 1.38, 0.08]} rotation={[0.4, 0, -0.9]} castShadow>
            <capsuleGeometry args={[0.05, 0.32, 4, 8]} />
            <meshStandardMaterial color={vest} roughness={0.55} />
          </mesh>
          <mesh position={[0.34, 1.58, 0.12]} castShadow>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshStandardMaterial color={skin} roughness={0.6} />
          </mesh>
          <mesh position={[0.05, 1.62, 0.16]} rotation={[0.15, 0.15, 0.08]} castShadow>
            <boxGeometry args={[1.7, 0.08, 0.24]} />
            <meshStandardMaterial color="#a56a32" roughness={0.8} />
          </mesh>
          <mesh position={[0.05, 1.67, 0.16]} rotation={[0.15, 0.15, 0.08]}>
            <boxGeometry args={[1.7, 0.015, 0.18]} />
            <meshStandardMaterial color="#e4c294" roughness={0.65} />
          </mesh>
        </group>
      ) : (
        <mesh position={[0.28, 1.02, 0]} rotation={[0, 0, -0.25]} castShadow>
          <capsuleGeometry args={[0.055, 0.36, 4, 8]} />
          <meshStandardMaterial color={vest} roughness={0.55} />
        </mesh>
      )}
      {load === "toolbox" ? (
        <group position={[-0.42, 0.62, 0.08]}>
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.16, 0.16]} />
            <meshStandardMaterial color="#c4512a" roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <torusGeometry args={[0.06, 0.012, 6, 10, Math.PI]} />
            <meshStandardMaterial color="#f2d34a" metalness={0.4} roughness={0.35} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function Ladder() {
  const rungs = [0.4, 0.85, 1.3, 1.75, 2.2, 2.65, 3.1];
  return (
    <group position={[-4.7, 0, 3.1]} rotation={[0.18, 0.2, 0]}>
      <mesh position={[-0.22, 1.7, 0]} castShadow>
        <boxGeometry args={[0.06, 3.4, 0.06]} />
        <meshStandardMaterial color="#d7d0c4" roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh position={[0.22, 1.7, 0]} castShadow>
        <boxGeometry args={[0.06, 3.4, 0.06]} />
        <meshStandardMaterial color="#d7d0c4" roughness={0.55} metalness={0.25} />
      </mesh>
      {rungs.map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[0.5, 0.04, 0.04]} />
          <meshStandardMaterial color="#b9b3a8" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function SkyDome() {
  const texture = useMemo(() => paintSky(), []);
  return <primitive attach="background" object={texture} />;
}

function paintSky() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (!ctx) return texture;
  const sky = ctx.createLinearGradient(0, 0, 0, 1024);
  sky.addColorStop(0, "#155a9c");
  sky.addColorStop(0.42, "#2f86c8");
  sky.addColorStop(0.72, "#4e9ed4");
  sky.addColorStop(1, "#7eb6df");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 1024);
  return texture;
}

function Pond() {
  const reeds: Array<[number, number, number]> = [
    [4.05, 0, 0.7],
    [3.55, 0, 2.05],
    [-3.75, 0, 1.55],
    [-2.35, 0, 3.35],
    [0.85, 0, 4.0],
    [2.15, 0, -3.5],
  ];
  return (
    <group position={[-8, 0.08, -22]}>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[3.55, 56]} />
        <MeshReflectorMaterial
          resolution={512}
          mirror={0.86}
          mixBlur={0.65}
          mixStrength={1.6}
          blur={[256, 80]}
          roughness={0.04}
          metalness={0.62}
          color="#1f6f96"
          depthScale={1.1}
          minDepthThreshold={0.15}
          maxDepthThreshold={1.15}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <ringGeometry args={[3.42, 4.15, 56]} />
        <meshStandardMaterial color="#3e7634" roughness={1} />
      </mesh>
      {reeds.map((position) => (
        <group key={position.join()} position={position}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.04, 1.1, 5]} />
            <meshStandardMaterial color="#3e6b32" roughness={0.8} />
          </mesh>
          <mesh position={[0.08, 1.05, 0]} rotation={[0, 0, 0.5]} castShadow>
            <coneGeometry args={[0.08, 0.28, 5]} />
            <meshStandardMaterial color="#4d7c38" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {[
        [4.7, 0.12, -0.4, 0.28],
        [-4.55, 0.1, 0.7, 0.22],
        [1.15, 0.08, 4.55, 0.18],
      ].map((rock) => (
        <mesh key={rock.join()} position={[rock[0], rock[1], rock[2]]} scale={[1, 0.55, 0.85]} castShadow>
          <sphereGeometry args={[rock[3], 10, 8]} />
          <meshStandardMaterial color="#8d8680" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function clearOfWork(x: number, z: number, margin = 0) {
  if (x < -40 || x > 48 || z < -43 || z > 45) return false;
  const pond = (x + 8) ** 2 + (z + 22) ** 2;
  if (pond < (3.95 + margin) ** 2) return false;
  if (Math.abs(x - 2.2) < 8.3 + margin && Math.abs(z + 0.4) < 6.7 + margin) return false;
  const gear: Array<[number, number, number]> = [
    [-8.5, 6.2, 2.1],
    [7.2, 8.4, 2.4],
    [-6.2, 9.2, 1.8],
    [-1.2, 5.6, 1.3],
    [13.2, -2.2, 1.5],
  ];
  return gear.every(([gx, gz, radius]) => (x - gx) ** 2 + (z - gz) ** 2 > (radius + margin) ** 2);
}

function Shrubs() {
  const bushes = useMemo(() => {
    const placed: Array<[number, number, number]> = [];
    let guard = 0;
    while (placed.length < 130 && guard < 4000) {
      guard += 1;
      const x = -38 + Math.random() * 84;
      const z = -41 + Math.random() * 84;
      if (!clearOfWork(x, z, 1)) continue;
      if (placed.some(([px, , pz]) => (px - x) ** 2 + (pz - z) ** 2 < 10)) continue;
      placed.push([x, 0.32 + Math.random() * 0.38, z]);
    }
    return placed;
  }, []);
  const trees = useMemo(() => {
    const placed: Array<[number, number]> = [];
    let guard = 0;
    while (placed.length < 14 && guard < 2000) {
      guard += 1;
      const x = -36 + Math.random() * 80;
      const z = -40 + Math.random() * 80;
      if (!clearOfWork(x, z, 1.2)) continue;
      if (placed.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 70)) continue;
      placed.push([x, z]);
    }
    return placed;
  }, []);
  return (
    <group>
      {bushes.map(([x, scale, z]) => (
        <group key={`${x.toFixed(2)}-${z.toFixed(2)}`} position={[x, 0, z]}>
          <mesh position={[0, scale * 0.72, 0]} scale={scale} castShadow>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#3d7632" roughness={0.92} />
          </mesh>
          <mesh position={[scale * 0.7, scale * 0.5, scale * 0.25]} scale={scale * 0.72} castShadow>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#4c8a3c" roughness={0.92} />
          </mesh>
        </group>
      ))}
      {trees.map(([x, z]) => (
        <group key={`${x.toFixed(2)}-${z.toFixed(2)}`} position={[x, 0, z]}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.16, 1.8, 7]} />
            <meshStandardMaterial color="#6a4a2e" roughness={0.85} />
          </mesh>
          <mesh position={[0, 2.05, 0]} castShadow>
            <sphereGeometry args={[0.78, 12, 10]} />
            <meshStandardMaterial color="#3a7030" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Clouds() {
  const spots: Array<[number, number, number, number]> = [
    [-14, 24, -8, 2.4],
    [-6, 27, -16, 3.1],
    [2, 23, -12, 2.2],
    [16, 26, -10, 2.8],
    [22, 22, 2, 2.1],
    [8, 29, -18, 3.4],
  ];
  return (
    <group>
      {spots.map((spot) => (
        <Cloud key={spot.join()} position={[spot[0], spot[1], spot[2]]} scale={spot[3]} />
      ))}
    </group>
  );
}

function Cloud({ position, scale }: { position: [number, number, number]; scale: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.x = position[0] + Math.sin(clock.elapsedTime * 0.04 + position[1]) * 1.2;
  });
  const puffs: Array<[number, number, number, number]> = [
    [0, 0, 0, 1],
    [0.9, 0.12, 0.05, 0.72],
    [-0.85, 0.05, 0.1, 0.68],
    [0.25, 0.38, -0.1, 0.62],
    [-0.3, 0.28, 0.18, 0.5],
    [1.3, -0.05, -0.08, 0.48],
  ];
  return (
    <group ref={ref} position={position} scale={scale}>
      {puffs.map((puff) => (
        <mesh key={puff.join()} position={[puff[0], puff[1], puff[2]]} scale={puff[3]} castShadow>
          <sphereGeometry args={[1, 18, 14]} />
          <meshStandardMaterial color="#f7fbff" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Crane() {
  const hook = useRef<THREE.Group>(null);
  const mast = useMemo(() => trussSegments(new THREE.Vector3(0, 0, 0), 24, 0.7, 2, "mast"), []);
  const jib = useMemo(() => trussSegments(new THREE.Vector3(0, 24, 0), 16, 0.42, 2, "jib"), []);
  const counter = useMemo(() => trussSegments(new THREE.Vector3(0, 24, 0), 5.5, 0.38, 1.4, "counter"), []);

  useFrame(({ clock }) => {
    if (!hook.current) return;
    hook.current.position.y = 11.2 + Math.sin(clock.elapsedTime * 0.7) * 0.35;
    hook.current.rotation.z = Math.sin(clock.elapsedTime * 0.45) * 0.04;
  });

  return (
    <group position={[13.2, 0, -2.2]}>
      <Braces segments={mast} thickness={0.08} />
      <Braces segments={jib} thickness={0.06} />
      <Braces segments={counter} thickness={0.06} />
      {[-0.7, 0.7].map((x) =>
        [-0.7, 0.7].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 12, z]} castShadow>
            <boxGeometry args={[0.12, 24, 0.12]} />
            <meshStandardMaterial color={YELLOW} metalness={0.22} roughness={0.38} />
          </mesh>
        )),
      )}
      <mesh position={[0, 24.35, 0]} castShadow>
        <boxGeometry args={[2.4, 0.35, 2.4]} />
        <meshStandardMaterial color={YELLOW_DARK} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0.9, 25.15, 0]} castShadow>
        <boxGeometry args={[1.15, 1.25, 1.15]} />
        <meshStandardMaterial color={YELLOW} metalness={0.4} roughness={0.42} />
      </mesh>
      <mesh position={[0.9, 25.2, 0.58]}>
        <boxGeometry args={[0.7, 0.55, 0.04]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.55} roughness={0.05} metalness={0.1} />
      </mesh>
      <mesh position={[4.6, 23.2, 0]} castShadow>
        <boxGeometry args={[1.6, 0.7, 1.3]} />
        <meshStandardMaterial color="#4d5560" metalness={0.3} roughness={0.55} />
      </mesh>
      <mesh position={[-6.2, 22.4, 0]}>
        <boxGeometry args={[0.03, 3.4, 0.03]} />
        <meshStandardMaterial color="#d5dde3" metalness={0.8} roughness={0.25} />
      </mesh>
      <group ref={hook} position={[-6.2, 11.2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.28, 0.7, 0.28]} />
          <meshStandardMaterial color="#2c3136" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.7, 0]} castShadow>
          <boxGeometry args={[1.5, 0.16, 2.2]} />
          <meshStandardMaterial color={CONCRETE} roughness={0.86} />
        </mesh>
      </group>
    </group>
  );
}

function trussSegments(origin: THREE.Vector3, length: number, half: number, bay: number, kind: "mast" | "jib" | "counter") {
  const segments: Array<[THREE.Vector3, THREE.Vector3]> = [];
  const steps = Math.max(1, Math.floor(length / bay));
  if (kind === "mast") {
    const corners = [
      [half, half],
      [-half, half],
      [-half, -half],
      [half, -half],
    ];
    for (let i = 0; i < steps; i += 1) {
      const y0 = origin.y + i * bay;
      const y1 = origin.y + (i + 1) * bay;
      for (let c = 0; c < 4; c += 1) {
        const a = corners[c];
        const b = corners[(c + 1) % 4];
        segments.push([
          new THREE.Vector3(origin.x + a[0], y0, origin.z + a[1]),
          new THREE.Vector3(origin.x + b[0], y0, origin.z + b[1]),
        ]);
        segments.push([
          new THREE.Vector3(origin.x + a[0], y0, origin.z + a[1]),
          new THREE.Vector3(origin.x + b[0], y1, origin.z + b[1]),
        ]);
        segments.push([
          new THREE.Vector3(origin.x + b[0], y0, origin.z + b[1]),
          new THREE.Vector3(origin.x + a[0], y1, origin.z + a[1]),
        ]);
      }
    }
    return segments;
  }
  const sign = kind === "jib" ? -1 : 1;
  for (let i = 0; i < steps; i += 1) {
    const x0 = origin.x + sign * i * bay;
    const x1 = origin.x + sign * (i + 1) * bay;
    const top = origin.y + half;
    const bottom = origin.y - half * 0.2;
    segments.push([
      new THREE.Vector3(x0, top, origin.z),
      new THREE.Vector3(x1, bottom, origin.z),
    ]);
    segments.push([
      new THREE.Vector3(x0, bottom, origin.z),
      new THREE.Vector3(x1, top, origin.z),
    ]);
    segments.push([
      new THREE.Vector3(x0, top, origin.z - half * 0.45),
      new THREE.Vector3(x1, top, origin.z + half * 0.45),
    ]);
  }
  return segments;
}

function Braces({ segments, thickness }: { segments: Array<[THREE.Vector3, THREE.Vector3]>; thickness: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(thickness, 1, thickness), [thickness]);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: YELLOW, metalness: 0.22, roughness: 0.36 }),
    [],
  );
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    segments.forEach(([a, b], index) => {
      const direction = b.clone().sub(a);
      const length = direction.length();
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.scale.set(1, length, 1);
      dummy.quaternion.setFromUnitVectors(up, direction.normalize());
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [segments]);
  return (
    <instancedMesh ref={ref} args={[geometry, material, segments.length]} castShadow />
  );
}

function Excavator({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.28, -0.48]} castShadow>
        <boxGeometry args={[2.1, 0.32, 0.36]} />
        <meshStandardMaterial color="#2b3036" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.28, 0.48]} castShadow>
        <boxGeometry args={[2.1, 0.32, 0.36]} />
        <meshStandardMaterial color="#2b3036" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[1.5, 0.55, 1.15]} />
        <meshStandardMaterial color={YELLOW} metalness={0.4} roughness={0.42} />
      </mesh>
      <mesh position={[-0.15, 1.25, 0]} castShadow>
        <boxGeometry args={[0.85, 0.62, 0.9]} />
        <meshStandardMaterial color={YELLOW} metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[-0.15, 1.28, 0.46]}>
        <boxGeometry args={[0.62, 0.36, 0.04]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.5} roughness={0.05} />
      </mesh>
      <mesh position={[1.15, 1.15, 0]} rotation={[0, 0, -0.7]} castShadow>
        <boxGeometry args={[1.5, 0.18, 0.22]} />
        <meshStandardMaterial color={YELLOW_DARK} metalness={0.4} roughness={0.45} />
      </mesh>
      <mesh position={[2.15, 0.55, 0]} rotation={[0, 0, 0.55]} castShadow>
        <boxGeometry args={[1.15, 0.14, 0.18]} />
        <meshStandardMaterial color="#3a4046" metalness={0.45} roughness={0.4} />
      </mesh>
      <mesh position={[2.7, 0.22, 0]} castShadow>
        <boxGeometry args={[0.42, 0.28, 0.5]} />
        <meshStandardMaterial color="#2c3136" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Truck({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, 0.4, 0]}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[3.3, 0.45, 1.35]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh position={[-1.15, 1.15, 0]} castShadow>
        <boxGeometry args={[1.15, 0.85, 1.28]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.5} />
      </mesh>
      <mesh position={[-1.15, 1.2, 0.65]}>
        <boxGeometry args={[0.7, 0.4, 0.04]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.45} />
      </mesh>
      <mesh position={[0.7, 1.15, 0]} castShadow>
        <boxGeometry args={[1.8, 0.55, 1.25]} />
        <meshStandardMaterial color={DIRT} roughness={0.95} />
      </mesh>
      {[-1.1, 0.9].map((x) =>
        [-0.72, 0.72].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.32, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.32, 0.32, 0.28, 12]} />
            <meshStandardMaterial color="#1c1f22" roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Trailer({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 1.7, 2.1]} />
        <meshStandardMaterial color="#efe8dc" roughness={0.7} />
      </mesh>
      <mesh position={[1.2, 1.25, 1.06]}>
        <boxGeometry args={[0.7, 0.7, 0.04]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.4} />
      </mesh>
      <mesh position={[-2.05, 1.15, 0]}>
        <boxGeometry args={[0.08, 1.3, 0.7]} />
        <meshStandardMaterial color="#8d3d14" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Lumber({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[0, 0.12 + i * 0.16, 0]} castShadow>
          <boxGeometry args={[2.4, 0.14, 0.9]} />
          <meshStandardMaterial color={i % 2 ? "#c49255" : "#a8743d"} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Cooler({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.55, 0.7, 0.48]} />
        <meshStandardMaterial color="#ef4d3a" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.82, 0]} castShadow>
        <boxGeometry args={[0.58, 0.12, 0.5]} />
        <meshStandardMaterial color="#f7f4ee" roughness={0.5} />
      </mesh>
      <mesh position={[0.22, 0.55, 0.25]}>
        <boxGeometry args={[0.08, 0.22, 0.04]} />
        <meshStandardMaterial color="#1c6b9a" roughness={0.4} />
      </mesh>
    </group>
  );
}

function Spool({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.7, 16]} />
        <meshStandardMaterial color="#d08a3a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.08, 16]} />
        <meshStandardMaterial color="#efe8dc" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.38, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.08, 16]} />
        <meshStandardMaterial color="#efe8dc" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Fence() {
  const posts = [-6, -3, 0, 3, 6, 9];
  return (
    <group position={[2, 0, 7.2]}>
      {posts.map((x) => (
        <mesh key={x} position={[x, 0.7, 0]} castShadow>
          <boxGeometry args={[0.08, 1.4, 0.08]} />
          <meshStandardMaterial color="#d8d2c6" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[1.5, 1.05, 0]}>
        <boxGeometry args={[15.2, 0.08, 0.05]} />
        <meshStandardMaterial color="#f08a12" roughness={0.5} />
      </mesh>
      <mesh position={[1.5, 0.4, 0]}>
        <boxGeometry args={[15.2, 0.08, 0.05]} />
        <meshStandardMaterial color="#f08a12" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Cones() {
  const spots: Array<[number, number, number]> = [
    [-3.5, 0, 6.4],
    [-2.4, 0, 6.7],
    [6.4, 0, 6.2],
    [8.8, 0, 5.4],
  ];
  return (
    <group>
      {spots.map((position) => (
        <mesh key={position.join()} position={[position[0], 0.28, position[2]]} castShadow>
          <coneGeometry args={[0.18, 0.55, 10]} />
          <meshStandardMaterial color="#f26b1d" roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}
