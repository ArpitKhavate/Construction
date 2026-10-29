"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Html, Line, OrbitControls } from "@react-three/drei";
import lot from "@/data/lot.json";
import hood from "@/data/neighborhood.json";

// All geometry is in feet, x = east, y = north, centered on the subject parcel.
// Three.js is y-up, so lot (x, y) maps to (x, height, -y).
type Ring = number[][];

const SLAB_R = 150; // diorama radius in feet
const SLAB_DEPTH = 10;
const COLORS = {
  ground: "#b8c79c",
  asphalt: "#5d5f63",
  curb: "#d9d3c6",
  soil: "#8b6b4c",
  soilDark: "#6f533a",
  grass: ["#9cc47a", "#a6cb82", "#93bd73", "#aacf86"],
  grassSubject: "#86c160",
  walls: ["#f1e7d6", "#e9dfcf", "#e3e6e4", "#efe1cc", "#e6dccb"],
  roofs: ["#5b616b", "#6d6259", "#4f5660", "#7a6a5c"],
  houseWall: "#f6ecda",
  houseRoof: "#454b54",
  aduWall: "#e8742c",
  aduRoof: "#1d8aa3",
  trunk: "#7a5a3c",
  leaves: ["#5f9e4a", "#4e8c3e", "#77b459", "#6aa850"],
};

// Deterministic pseudo-random so the scene is identical on every load.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function shapeFrom(ring: Ring) {
  const s = new THREE.Shape();
  ring.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return s;
}

function centroid(ring: Ring): [number, number] {
  const pts = ring.slice(0, -1);
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}

function inside([x, y]: number[], ring: Ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const within = (ring: Ring, r: number) => ring.every(([x, y]) => Math.hypot(x, y) < r);

function Flat({ ring, y, depth, color }: { ring: Ring; y: number; depth: number; color: string }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(shapeFrom(ring), { depth, bevelEnabled: false }), [ring, depth]);
  return (
    <mesh geometry={geo} rotation-x={-Math.PI / 2} position-y={y} receiveShadow castShadow={depth > 2}>
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

// A building: walls extruded from the footprint, a darker roof slab on top.
function Building({ ring, height, wall, roof }: { ring: Ring; height: number; wall: string; roof: string }) {
  const wallH = Math.max(8, height * 0.72);
  return (
    <group>
      <Flat ring={ring} y={0.6} depth={wallH} color={wall} />
      <Flat ring={ring} y={0.6 + wallH} depth={1.6} color={roof} />
    </group>
  );
}

// Points every `step` feet along a polyline.
function samplePath(path: Ring, step: number) {
  const out: number[][] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let k = 0; k < n; k++) out.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
  }
  out.push(path[path.length - 1]);
  return out;
}

// A street: an asphalt ribbon along the centerline, clipped to the diorama.
function Street({ path }: { path: Ring }) {
  const geo = useMemo(() => {
    const pts = samplePath(path, 3).filter(([x, y]) => Math.hypot(x, y) < SLAB_R - 1);
    const pos: number[] = [];
    const idx: number[] = [];
    const half = 15;
    pts.forEach(([x, y], i) => {
      const [px, py] = pts[Math.max(0, i - 1)];
      const [nx, ny] = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(nx - px, ny - py) || 1;
      const [ox, oy] = [(-(ny - py) / len) * half, ((nx - px) / len) * half];
      pos.push(x + ox, 0.3, -(y + oy), x - ox, 0.3, -(y - oy));
      if (i > 0 && Math.hypot(x - px, y - py) < 10) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [path]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color={COLORS.asphalt} roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Tree({ x, y, s, tone }: { x: number; y: number; s: number; tone: string }) {
  return (
    <group position={[x, 0.6, -y]} scale={s}>
      <mesh position-y={3} castShadow>
        <cylinderGeometry args={[0.5, 0.7, 6, 6]} />
        <meshStandardMaterial color={COLORS.trunk} roughness={1} />
      </mesh>
      <mesh position-y={9} castShadow>
        <icosahedronGeometry args={[5, 0]} />
        <meshStandardMaterial color={tone} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[1.8, 12, 0.8]} castShadow>
        <icosahedronGeometry args={[3.4, 0]} />
        <meshStandardMaterial color={tone} roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

function Adu() {
  const { center, width, depth, height, rotationDeg } = lot.adu;
  const wall = height * 0.62;
  const roofRise = height - wall;
  const roof = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-depth / 2 - 1, 0);
    s.lineTo(depth / 2 + 1, 0);
    s.lineTo(0, roofRise + 0.6);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: width + 2, bevelEnabled: false });
    g.translate(0, 0, -(width + 2) / 2);
    return g;
  }, [width, depth, roofRise]);

  return (
    <group position={[center[0], 0.6, -center[1]]} rotation-y={(rotationDeg * Math.PI) / 180}>
      <mesh position={[0, wall / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, wall, depth]} />
        <meshStandardMaterial color={COLORS.aduWall} roughness={0.7} />
      </mesh>
      {/* door and window */}
      <mesh position={[0, 3.2, depth / 2 + 0.05]}>
        <planeGeometry args={[3, 6.4]} />
        <meshStandardMaterial color="#fff6ea" />
      </mesh>
      <mesh position={[width / 2 + 0.05, wall * 0.55, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[5, 3]} />
        <meshStandardMaterial color="#cfe9f0" roughness={0.2} metalness={0.1} />
      </mesh>
      <mesh geometry={roof} position={[0, wall, 0]} rotation-y={Math.PI / 2} castShadow>
        <meshStandardMaterial color={COLORS.aduRoof} roughness={0.6} />
      </mesh>
      <Line points={[[0, height + 1, 0], [0, height + 22, 0]]} color="#2b2b28" lineWidth={1} />
      <Html position={[0, height + 25, 0]} center zIndexRange={[10, 0]}>
        <div className="tag">
          Room for a backyard home
          <span>about {width * depth} sq ft · illustrative</span>
        </div>
      </Html>
    </group>
  );
}

function Diorama() {
  const neighbors = useMemo(() => hood.parcels.filter((r) => within(r, SLAB_R - 4)), []);
  const neighborBlds = useMemo(() => hood.buildings.filter((b) => within(b.ring, SLAB_R - 4)), []);
  const house = lot.buildings.reduce((a, b) => (b.area > a.area ? b : a));
  const shed = lot.buildings.find((b) => b !== house)!;

  const trees = useMemo(() => {
    const rand = rng(7);
    const yards = [...neighbors, lot.parcel];
    const blds = [...neighborBlds.map((b) => b.ring), ...lot.buildings.map((b) => b.ring)];
    const [ax, ay] = lot.adu.center;
    const streetPts = hood.streets.flatMap((st) => samplePath(st.path, 6));
    const out: { x: number; y: number; s: number; tone: string }[] = [];
    for (let i = 0; i < 1500 && out.length < 85; i++) {
      const x = (rand() * 2 - 1) * SLAB_R;
      const y = (rand() * 2 - 1) * SLAB_R;
      if (Math.hypot(x, y) > SLAB_R - 10) continue;
      const inYard = yards.some((r) => inside([x, y], r));
      if (!inYard && streetPts.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 22)) continue;
      if (Math.hypot(x - ax, y - ay) < 18) continue;
      const near = blds.some((r) => r.some(([bx, by]) => Math.hypot(bx - x, by - y) < 9) || inside([x, y], r));
      if (near) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.y - y) < 14)) continue;
      out.push({ x, y, s: 0.8 + rand() * 0.6, tone: COLORS.leaves[Math.floor(rand() * 4)] });
    }
    return out;
  }, [neighbors, neighborBlds]);

  const [hx, hy] = centroid(house.ring);

  // One label per street name, at the in-slab point nearest the lot.
  const streetLabels = useMemo(() => {
    const best = new Map<string, { name: string; x: number; y: number; d: number }>();
    for (const st of hood.streets) {
      const name = st.name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
      for (const [x, y] of samplePath(st.path, 6)) {
        const d = Math.hypot(x, y);
        if (d > SLAB_R - 30 || d < 60) continue;
        if (!best.has(name) || d < best.get(name)!.d) best.set(name, { name, x, y, d });
      }
    }
    return [...best.values()];
  }, []);

  return (
    <group>
      {/* slab: pavement top, soil sides */}
      <mesh position-y={-SLAB_DEPTH / 2 - 0.6}>
        <cylinderGeometry args={[SLAB_R, SLAB_R, SLAB_DEPTH, 96]} />
        <meshStandardMaterial color={COLORS.soil} roughness={1} />
      </mesh>
      <mesh position-y={-SLAB_DEPTH - 2}>
        <cylinderGeometry args={[SLAB_R - 2, SLAB_R - 6, 4, 96]} />
        <meshStandardMaterial color={COLORS.soilDark} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <circleGeometry args={[SLAB_R, 96]} />
        <meshStandardMaterial color={COLORS.ground} roughness={1} />
      </mesh>
      {hood.streets.map((st, i) => (
        <Street key={i} path={st.path} />
      ))}
      {streetLabels.map((l) => (
        <Html key={l.name} position={[l.x, 2, -l.y]} center zIndexRange={[10, 0]}>
          <div className="tag tag-quiet">{l.name}</div>
        </Html>
      ))}

      {neighbors.map((r, i) => (
        <Flat key={i} ring={r} y={0} depth={0.5} color={COLORS.grass[i % 4]} />
      ))}
      {neighborBlds.map((b, i) => (
        <Building key={i} ring={b.ring} height={b.height} wall={COLORS.walls[i % 5]} roof={COLORS.roofs[i % 4]} />
      ))}

      {/* the subject lot */}
      <Flat ring={lot.parcel} y={0} depth={0.7} color={COLORS.grassSubject} />
      <Line points={lot.parcel.map(([x, y]) => [x, 0.8, -y] as [number, number, number])} color="#ffffff" lineWidth={2.5} />
      <Building ring={house.ring} height={house.height} wall={COLORS.houseWall} roof={COLORS.houseRoof} />
      <Building ring={shed.ring} height={shed.height} wall="#ebdfca" roof="#6d6259" />
      <Html position={[hx, 20, -hy]} center zIndexRange={[10, 0]}>
        <div className="tag tag-quiet">Existing house</div>
      </Html>
      <Adu />

      {trees.map((t, i) => (
        <Tree key={i} {...t} />
      ))}
    </group>
  );
}

// Fit the diorama to the canvas: pull back on narrow screens; on wide ones shift it right
// so the headline sits on open background.
function CameraFit() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const dist = aspect < 1 ? 760 : aspect < 1.4 ? 780 : 700;
    camera.position.setLength(dist);
    const cam = camera as THREE.PerspectiveCamera;
    if (aspect > 1.2) cam.setViewOffset(size.width, size.height, -size.width * 0.16, size.height * 0.04, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

export default function LotScene() {
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [300, 260, 330], fov: 30, near: 20, far: 4000 }}
      aria-label="3D model of 3105 Cherrywood Rd and its neighbors: the lot, the existing house and structure, and an illustrative backyard home"
    >
      <CameraFit />
      <hemisphereLight args={["#fff6e5", "#9a8a70", 1.1]} />
      <directionalLight
        position={[-160, 260, 120]}
        intensity={2.2}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.8}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
      />
      <Diorama />
      <ContactShadows position-y={-SLAB_DEPTH - 30} scale={600} blur={3} opacity={0.35} far={60} />
      <OrbitControls
        target={[0, -6, 0]}
        autoRotate={!reduceMotion}
        autoRotateSpeed={0.35}
        enablePan={false}
        enableZoom={false}
        minPolarAngle={0.5}
        maxPolarAngle={1.15}
      />
    </Canvas>
  );
}
