"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

// A street-level scene: a finished house beside one under construction, across a road.
// Units are roughly feet/4. x runs along the street, z is depth (negative = away), y is up.

const C = {
  grass: "#8cc063",
  grassDark: "#77ad52",
  lawn: "#9ccb6f",
  sidewalk: "#d6d3cc",
  curb: "#bdb9b0",
  road: "#6b6e73",
  line: "#f4f1e8",
  wall: "#eef0f0",
  wallWarm: "#e9e1d3",
  trim: "#b5653a",
  roofTeal: "#2f7f8f",
  roofSlate: "#5f6873",
  door: "#c0612f",
  glass: "#9fc6d9",
  frame: "#4a5560",
  garage: "#8e959c",
  wood: "#d9b07a",
  woodDark: "#b98a52",
  osb: "#cfa96b",
  concrete: "#c9c5bd",
  scaffold: "#e0a92b",
  cone: "#ef7a2a",
  trunk: "#8a6142",
  leaf: ["#5fa047", "#4f8f3c", "#76b356", "#6aa84d"],
  far: "#dfe6ea",
};

// ---------------------------------------------------------------------------
// Procedural surface textures, drawn once on canvases in light neutrals so the
// material color tints them. Each is tiled by repeat at the point of use.
type TexKind = "siding" | "shingle" | "brick" | "wood" | "osb";

function drawTexture(kind: TexKind): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  let seed = kind.length * 977;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);

  if (kind === "siding") {
    // Lap siding: a shadow line under each board, a highlight on top.
    for (let y = 0; y < size; y += 32) {
      g.fillStyle = "rgba(0,0,0,0.16)";
      g.fillRect(0, y + 28, size, 4);
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.fillRect(0, y, size, 2);
    }
  } else if (kind === "shingle") {
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      const off = row % 2 ? 24 : 0;
      for (let x = -off; x < size; x += 48) {
        const t = 0.9 + rand() * 0.12;
        g.fillStyle = `rgba(${255 * t},${255 * t},${255 * t},1)`;
        g.fillRect(x + 1, y + 1, 46, 30);
      }
      g.fillStyle = "rgba(0,0,0,0.28)";
      g.fillRect(0, y + 28, size, 4);
      for (let x = -off; x < size; x += 48) g.fillRect(x, y, 2, 30);
    }
  } else if (kind === "brick") {
    g.fillStyle = "rgba(255,255,255,1)";
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 32 : 0;
      for (let x = -off; x < size; x += 64) {
        const t = 0.85 + rand() * 0.2;
        g.fillStyle = `rgb(${255 * t},${235 * t},${225 * t})`;
        g.fillRect(x + 3, row * 32 + 3, 58, 26);
      }
    }
    g.globalCompositeOperation = "destination-over";
    g.fillStyle = "#d8d2c8";
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = "source-over";
  } else if (kind === "wood") {
    for (let i = 0; i < 40; i++) {
      const x = rand() * size;
      g.strokeStyle = `rgba(90,55,20,${0.08 + rand() * 0.12})`;
      g.lineWidth = 1 + rand() * 2;
      g.beginPath();
      for (let y = 0; y <= size; y += 16) g.lineTo(x + Math.sin(y / 30 + i) * 4, y);
      g.stroke();
    }
  } else if (kind === "osb") {
    for (let i = 0; i < 900; i++) {
      const t = 0.75 + rand() * 0.3;
      g.fillStyle = `rgba(${200 * t},${150 * t},${90 * t},0.35)`;
      g.save();
      g.translate(rand() * size, rand() * size);
      g.rotate(rand() * Math.PI);
      g.fillRect(-6, -2, 12, 4);
      g.restore();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const texCache = new Map<TexKind, THREE.CanvasTexture>();
function useTex(kind: TexKind, rx: number, ry: number, rot = 0) {
  return useMemo(() => {
    if (!texCache.has(kind)) texCache.set(kind, drawTexture(kind));
    const t = texCache.get(kind)!.clone();
    t.repeat.set(rx, ry);
    t.rotation = rot;
    t.needsUpdate = true;
    return t;
  }, [kind, rx, ry, rot]);
}

function Box({
  p,
  s,
  c,
  r = [0, 0, 0],
  cast = true,
  map,
  emissive,
}: {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  r?: [number, number, number];
  cast?: boolean;
  map?: THREE.Texture;
  emissive?: [string, number];
}) {
  return (
    <mesh position={p} rotation={r} castShadow={cast} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={c}
        map={map}
        roughness={0.85}
        flatShading={!map}
        emissive={emissive?.[0] ?? "#000000"}
        emissiveIntensity={emissive?.[1] ?? 0}
      />
    </mesh>
  );
}

// A box whose surface is tiled with a procedural texture, repeat sized to the front face.
function TexBox({
  kind,
  tile = 2,
  ...props
}: Omit<Parameters<typeof Box>[0], "map"> & { kind: TexKind; tile?: number }) {
  const [w, h] = props.s;
  const map = useTex(kind, Math.max(1, w / tile), Math.max(1, h / tile));
  return <Box {...props} map={map} />;
}

// Gable roof prism with shingles: ridge runs along x.
function Gable({ p, w, d, h, c, overhang = 0.8 }: { p: [number, number, number]; w: number; d: number; h: number; c: string; overhang?: number }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2 - overhang, 0);
    s.lineTo(d / 2 + overhang, 0);
    s.lineTo(0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w + overhang * 2, bevelEnabled: false });
    g.translate(0, 0, -(w + overhang * 2) / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }, [w, d, h, overhang]);
  // Extrude UVs are in shape units, so tile every ~1.6 units.
  const map = useTex("shingle", 0.6, 0.6, Math.PI / 2);
  return (
    <mesh geometry={geo} position={p} castShadow receiveShadow>
      <meshStandardMaterial color={c} map={map} roughness={0.8} />
    </mesh>
  );
}

function Window({ p, w = 2.2, h = 2.6, glow = false, shutters = false }: { p: [number, number, number]; w?: number; h?: number; glow?: boolean; shutters?: boolean }) {
  return (
    <group position={p}>
      <Box p={[0, 0, 0]} s={[w + 0.3, h + 0.3, 0.12]} c="#f7f5f0" cast={false} />
      <Box p={[0, 0, 0.07]} s={[w, h, 0.05]} c={C.glass} cast={false} emissive={glow ? ["#ffc878", 0.12] : undefined} />
      <Box p={[0, 0, 0.11]} s={[0.12, h, 0.04]} c="#f7f5f0" cast={false} />
      <Box p={[0, 0, 0.11]} s={[w, 0.12, 0.04]} c="#f7f5f0" cast={false} />
      {/* sill */}
      <Box p={[0, -h / 2 - 0.25, 0.18]} s={[w + 0.8, 0.18, 0.4]} c="#f7f5f0" />
      {shutters && (
        <>
          <Box p={[-w / 2 - 0.55, 0, 0.05]} s={[0.6, h + 0.3, 0.1]} c="#2a5f6a" cast={false} />
          <Box p={[w / 2 + 0.55, 0, 0.05]} s={[0.6, h + 0.3, 0.1]} c="#2a5f6a" cast={false} />
        </>
      )}
    </group>
  );
}

function FinishedHouse({ x, z }: { x: number; z: number }) {
  const w = 14, d = 10, h = 7.5;
  const gx = w / 2 + 4.5; // garage center
  return (
    <group position={[x, 0, z]}>
      {/* main body in lap siding */}
      <TexBox kind="siding" tile={2.4} p={[0, h / 2, 0]} s={[w, h, d]} c={C.wall} />
      <Gable p={[0, h, 0]} w={w} d={d} h={4.5} c={C.roofTeal} />
      <Box p={[0, h - 0.15, d / 2 + 0.85]} s={[w + 1.6, 0.3, 0.3]} c="#f7f5f0" />
      <Box p={[w / 2 - 0.3, h / 2, d / 2 + 0.85]} s={[0.22, h, 0.22]} c="#f7f5f0" />
      {/* front gable bay */}
      <TexBox kind="siding" tile={2.4} p={[-3, h / 2, d / 2 + 1.5]} s={[6, h, 3]} c={C.wallWarm} />
      <Gable p={[-3, h, d / 2 + 1.5]} w={3} d={6} h={3.2} c={C.trim} overhang={0.5} />
      <Box p={[-3, 0.15, d / 2 + 3.8]} s={[7, 0.3, 1.8]} c={C.concrete} />
      <Box p={[-3, 0.08, d / 2 + 5.1]} s={[3.2, 0.16, 0.9]} c={C.concrete} />
      {/* door with frame, knob, light and house number */}
      <Box p={[-3, 3.1, d / 2 + 3.03]} s={[2.5, 6.3, 0.08]} c="#f7f5f0" cast={false} />
      <Box p={[-3, 3, d / 2 + 3.08]} s={[2, 6, 0.1]} c={C.door} />
      <Box p={[-2.35, 3, d / 2 + 3.16]} s={[0.18, 0.18, 0.1]} c="#d9b45a" cast={false} />
      <Box p={[-1.3, 5.2, d / 2 + 3.15]} s={[0.4, 0.6, 0.25]} c="#2d2f33" emissive={["#ffcf7a", 0.9]} />
      <Box p={[-4.7, 5.2, d / 2 + 3.07]} s={[1, 0.45, 0.06]} c="#2d2f33" cast={false} />
      <Window p={[2.5, 4.2, d / 2 + 0.07]} glow shutters />
      <Window p={[5.7, 4.2, d / 2 + 0.07]} glow shutters />
      <Window p={[-3, 8.6, d / 2 + 3.02]} w={1.4} h={1} />
      {/* walkway to the sidewalk */}
      <Box p={[-3, 0.03, d / 2 + 7.7]} s={[1.8, 0.06, 4.6]} c={C.concrete} cast={false} />
      {/* garage */}
      <TexBox kind="siding" tile={2.4} p={[gx, 3.3, 0.5]} s={[9, 6.6, 9]} c={C.wall} />
      <Gable p={[gx, 6.6, 0.5]} w={9} d={9} h={3} c={C.roofTeal} overhang={0.5} />
      <Box p={[gx, 6.45, 5.55]} s={[10, 0.28, 0.28]} c="#f7f5f0" />
      <Box p={[gx, 2.7, 5.02]} s={[7.5, 5.5, 0.1]} c="#f7f5f0" cast={false} />
      <Box p={[gx, 2.6, 5.06]} s={[7, 5.2, 0.12]} c={C.garage} />
      {[0.9, 1.8, 2.7, 3.6, 4.5].map((y) => (
        <Box key={y} p={[gx, y, 5.13]} s={[7, 0.06, 0.04]} c="#7a8188" cast={false} />
      ))}
      {[-2.4, -0.8, 0.8, 2.4].map((wx) => (
        <Box key={wx} p={[gx + wx, 4.4, 5.14]} s={[1.2, 0.5, 0.03]} c={C.glass} cast={false} />
      ))}
      <Box p={[gx, 0.05, 9]} s={[7, 0.1, 8]} c={C.concrete} cast={false} />
      {/* brick chimney */}
      <TexBox kind="brick" tile={0.9} p={[-4.5, h + 3.6, -1.5]} s={[1.3, 3.2, 1.3]} c="#c26a48" />
      <Box p={[-4.5, h + 5.3, -1.5]} s={[1.6, 0.25, 1.6]} c="#7c7f84" />
      {/* foundation band */}
      <Box p={[0, 0.25, d / 2 + 0.03]} s={[w, 0.5, 0.06]} c="#a9a49a" cast={false} />
    </group>
  );
}

function Mailbox({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 1.6, 0]} s={[0.25, 3.2, 0.25]} c="#f7f5f0" />
      <Box p={[0, 3.4, 0]} s={[0.9, 0.8, 1.6]} c="#2d4d6b" />
      <Box p={[0.5, 3.6, 0.3]} s={[0.08, 0.6, 0.15]} c="#d8433a" cast={false} />
    </group>
  );
}

function Stud({ p, h, map }: { p: [number, number, number]; h: number; map: THREE.Texture }) {
  return <Box p={[p[0], p[1] + h / 2, p[2]]} s={[0.25, h, 0.25]} c={C.wood} map={map} />;
}

function Ladder({ p, rot }: { p: [number, number, number]; rot: number }) {
  const len = 9;
  return (
    <group position={p} rotation={[rot, 0, 0]}>
      <Box p={[-0.6, len / 2, 0]} s={[0.15, len, 0.15]} c="#c9ced3" />
      <Box p={[0.6, len / 2, 0]} s={[0.15, len, 0.15]} c="#c9ced3" />
      {Array.from({ length: 9 }, (_, i) => (
        <Box key={i} p={[0, 0.6 + i * 0.95, 0]} s={[1.2, 0.1, 0.1]} c="#c9ced3" cast={false} />
      ))}
    </group>
  );
}

function Wheelbarrow({ p, r = 0 }: { p: [number, number, number]; r?: number }) {
  return (
    <group position={p} rotation-y={r}>
      <Box p={[0, 1.4, 0]} s={[1.8, 0.7, 2.4]} c="#2f8a5a" r={[0.12, 0, 0]} />
      <Box p={[0, 1.65, 0]} s={[1.5, 0.12, 2]} c="#7b6a55" cast={false} />
      <mesh position={[0, 0.6, 1.4]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.6, 0.6, 0.3, 16]} />
        <meshStandardMaterial color="#2d2f33" />
      </mesh>
      <Box p={[-0.6, 1.1, -1.8]} s={[0.12, 0.12, 2]} c="#5c4632" r={[-0.2, 0, 0]} />
      <Box p={[0.6, 1.1, -1.8]} s={[0.12, 0.12, 2]} c="#5c4632" r={[-0.2, 0, 0]} />
      <Box p={[-0.6, 0.5, -0.6]} s={[0.12, 1, 0.12]} c="#5c4632" />
      <Box p={[0.6, 0.5, -0.6]} s={[0.12, 1, 0.12]} c="#5c4632" />
    </group>
  );
}

function PortableToilet({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <Box p={[0, 3.6, 0]} s={[3, 7.2, 3]} c="#3c78c2" />
      <Box p={[0, 7.4, 0]} s={[3.3, 0.4, 3.3]} c="#e9edf1" />
      <Box p={[0, 3.4, 1.53]} s={[2.2, 6, 0.06]} c="#346aaf" cast={false} />
      <Box p={[0, 6.3, 1.57]} s={[1, 0.3, 0.03]} c="#ffffff" cast={false} />
    </group>
  );
}

function Pickup({ p }: { p: [number, number, number] }) {
  const wheel = (x: number, z: number) => (
    <mesh key={`${x}${z}`} position={[x, 1.1, z]} rotation-x={Math.PI / 2} castShadow>
      <cylinderGeometry args={[1.1, 1.1, 0.8, 18]} />
      <meshStandardMaterial color="#26282c" roughness={0.9} />
    </mesh>
  );
  return (
    <group position={p}>
      <Box p={[0, 2, 0]} s={[14, 1.8, 5.6]} c="#d6452f" />
      <Box p={[-1.5, 3.9, 0]} s={[5, 2.2, 5.2]} c="#d6452f" />
      <Box p={[-1.5, 3.9, 2.62]} s={[4.2, 1.6, 0.05]} c="#2f4250" cast={false} />
      <Box p={[1.2, 3.9, 0]} s={[0.05, 1.7, 4.6]} c="#2f4250" cast={false} />
      {/* bed with lumber */}
      <Box p={[4.5, 3.1, 0]} s={[5, 0.4, 5.6]} c="#b23826" cast={false} />
      <Box p={[4.2, 3.5, 0]} s={[6.5, 0.35, 1.4]} c={C.wood} />
      {wheel(-4.2, 2.6)}
      {wheel(-4.2, -2.6)}
      {wheel(4.4, 2.6)}
      {wheel(4.4, -2.6)}
      <Box p={[-7, 2.2, 1.9]} s={[0.1, 0.5, 0.9]} c="#fff4d6" emissive={["#fff1c4", 0.6]} cast={false} />
      <Box p={[-7, 2.2, -1.9]} s={[0.1, 0.5, 0.9]} c="#fff4d6" emissive={["#fff1c4", 0.6]} cast={false} />
    </group>
  );
}

function UnderConstruction({ x, z }: { x: number; z: number }) {
  const w = 15, d = 10, h = 7.5;
  const studsX = Array.from({ length: 11 }, (_, i) => -w / 2 + (w * i) / 10);
  const studsZ = Array.from({ length: 7 }, (_, i) => -d / 2 + (d * i) / 6);
  const trusses = Array.from({ length: 9 }, (_, i) => -w / 2 + (w * i) / 8);
  const pitch = Math.atan2(4.5, d / 2 + 0.6);
  const rafter = Math.hypot(4.5, d / 2 + 0.6);
  const grain = useTex("wood", 1, 3);
  const osb = useTex("osb", 2, 2);
  return (
    <group position={[x, 0, z]}>
      {/* slab */}
      <Box p={[0, 0.3, 0]} s={[w + 1, 0.6, d + 1]} c={C.concrete} />
      {/* wall framing */}
      {studsX.map((sx) => (
        <group key={`x${sx}`}>
          <Stud p={[sx, 0.6, d / 2]} h={h} map={grain} />
          <Stud p={[sx, 0.6, -d / 2]} h={h} map={grain} />
        </group>
      ))}
      {studsZ.map((sz) => (
        <group key={`z${sz}`}>
          <Stud p={[-w / 2, 0.6, sz]} h={h} map={grain} />
          <Stud p={[w / 2, 0.6, sz]} h={h} map={grain} />
        </group>
      ))}
      {/* top and bottom plates, window header */}
      <Box p={[0, h + 0.6, d / 2]} s={[w, 0.3, 0.3]} c={C.woodDark} map={grain} />
      <Box p={[0, h + 0.6, -d / 2]} s={[w, 0.3, 0.3]} c={C.woodDark} map={grain} />
      <Box p={[-w / 2, h + 0.6, 0]} s={[0.3, 0.3, d]} c={C.woodDark} map={grain} />
      <Box p={[w / 2, h + 0.6, 0]} s={[0.3, 0.3, d]} c={C.woodDark} map={grain} />
      <Box p={[0, 0.75, d / 2]} s={[w, 0.3, 0.3]} c={C.woodDark} map={grain} />
      <Box p={[4, 5.4, d / 2]} s={[3.6, 0.5, 0.3]} c={C.woodDark} map={grain} />
      <Box p={[4, 2.6, d / 2]} s={[3.6, 0.3, 0.3]} c={C.woodDark} map={grain} />
      {/* plywood sheathing going up on the left of the front wall, with house wrap above */}
      <Box p={[-w / 4 - 0.4, 2.9, d / 2 + 0.2]} s={[w / 2 - 0.8, 4.6, 0.12]} c={C.osb} map={osb} />
      <Box p={[-w / 4 - 0.4, 6.35, d / 2 + 0.2]} s={[w / 2 - 0.8, 2.3, 0.1]} c="#eef1f4" />
      <Box p={[-w / 4 - 0.4, 6.35, d / 2 + 0.26]} s={[w / 2 - 1.6, 0.35, 0.02]} c="#3b6fb4" cast={false} />
      {/* roof trusses */}
      {trusses.map((tx) => (
        <group key={`t${tx}`} position={[tx, h + 0.75, 0]}>
          <Box p={[0, 4.5 / 2, (d / 2 + 0.6) / 2]} s={[0.2, 0.25, rafter]} r={[pitch, 0, 0]} c={C.wood} map={grain} />
          <Box p={[0, 4.5 / 2, -(d / 2 + 0.6) / 2]} s={[0.2, 0.25, rafter]} r={[-pitch, 0, 0]} c={C.wood} map={grain} />
          <Box p={[0, 0, 0]} s={[0.2, 0.25, d + 1.2]} c={C.wood} map={grain} />
          <Box p={[0, 2.2, 0]} s={[0.2, 4.4, 0.2]} c={C.wood} map={grain} />
          <Box p={[0, 1.1, 1.7]} s={[0.15, 0.2, 3.6]} r={[-0.65, 0, 0]} c={C.wood} map={grain} />
          <Box p={[0, 1.1, -1.7]} s={[0.15, 0.2, 3.6]} r={[0.65, 0, 0]} c={C.wood} map={grain} />
        </group>
      ))}
      <Box p={[0, h + 5.3, 0]} s={[w, 0.25, 0.25]} c={C.woodDark} map={grain} />
      {/* scaffolding across the front, with cross braces */}
      {[-w / 2 + 1, -w / 4, 0, w / 4, w / 2 - 1].map((sx) => (
        <Box key={`sp${sx}`} p={[sx, 5, d / 2 + 2.2]} s={[0.18, 10, 0.18]} c={C.scaffold} />
      ))}
      {[3.5, 7].map((sy) => (
        <group key={`sr${sy}`}>
          <Box p={[0, sy, d / 2 + 2.2]} s={[w - 1.5, 0.15, 0.15]} c={C.scaffold} />
          <Box p={[0, sy - 0.1, d / 2 + 1.6]} s={[w - 1.5, 0.15, 1.2]} c={C.woodDark} map={grain} />
          <Box p={[0, sy + 1.1, d / 2 + 2.2]} s={[w - 1.5, 0.1, 0.1]} c={C.scaffold} cast={false} />
        </group>
      ))}
      {[-w / 2 + 1 + 1.75, w / 4 + 1.75].map((bx, i) => (
        <Box key={`br${bx}`} p={[bx, 1.75, d / 2 + 2.2]} s={[0.1, 4.2, 0.1]} r={[0, 0, i ? -0.68 : 0.68]} c={C.scaffold} cast={false} />
      ))}
      <Ladder p={[w / 4 + 1.8, 0.6, d / 2 + 4]} rot={-0.2} />
      {/* lumber pile under a tarp, shingle bundles on a pallet */}
      {[0, 1, 2].map((i) => (
        <Box key={`l${i}`} p={[w / 2 + 3, 0.25 + i * 0.4, d / 2 + 4 - i * 0.1]} s={[6, 0.35, 1.6]} c={i % 2 ? C.wood : C.woodDark} map={grain} />
      ))}
      <Box p={[w / 2 + 3.4, 1.35, d / 2 + 4]} s={[3.6, 0.08, 2]} r={[0, 0, -0.08]} c="#2f6fb8" />
      <Box p={[-w / 2 + 2, 0.2, d / 2 + 5]} s={[3, 0.4, 2.2]} c={C.woodDark} />
      {[0, 1, 2].map((i) => (
        <Box key={`sh${i}`} p={[-w / 2 + 2, 0.65 + i * 0.4, d / 2 + 5]} s={[2.8, 0.38, 2]} c="#2f5f6c" />
      ))}
      <Wheelbarrow p={[1.5, 0, d / 2 + 6.5]} r={0.5} />
      <PortableToilet p={[w / 2 + 3.5, 0, -2]} />
      {[-w / 2 - 1, -w / 2 + 3.5, w / 2 - 2].map((cx) => (
        <group key={`c${cx}`} position={[cx, 0, d / 2 + 8.5]}>
          <mesh position-y={0.9} castShadow>
            <coneGeometry args={[0.5, 1.8, 12]} />
            <meshStandardMaterial color={C.cone} roughness={0.6} />
          </mesh>
          <Box p={[0, 1.1, 0]} s={[0.75, 0.22, 0.75]} c="#ffffff" cast={false} />
          <Box p={[0, 0.05, 0]} s={[1.1, 0.1, 1.1]} c="#30343a" cast={false} />
        </group>
      ))}
      {/* permit board on a post */}
      <Box p={[-w / 2 - 2.5, 2, d / 2 + 6.5]} s={[0.2, 4, 0.2]} c={C.woodDark} map={grain} />
      <Box p={[-w / 2 - 2.5, 4.2, d / 2 + 6.62]} s={[2.4, 1.6, 0.1]} c="#ffffff" />
      <Box p={[-w / 2 - 2.5, 4.6, d / 2 + 6.68]} s={[2, 0.25, 0.02]} c={C.cone} cast={false} />
      {[4.2, 3.9, 3.6].map((ly) => (
        <Box key={ly} p={[-w / 2 - 2.5, ly, d / 2 + 6.68]} s={[1.6, 0.08, 0.02]} c="#8a8f96" cast={false} />
      ))}
    </group>
  );
}

function RoundTree({ x, z, s = 1, tone = 0 }: { x: number; z: number; s?: number; tone?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position-y={2.5} castShadow>
        <cylinderGeometry args={[0.35, 0.5, 5, 7]} />
        <meshStandardMaterial color={C.trunk} roughness={1} flatShading />
      </mesh>
      <mesh position-y={6.5} castShadow>
        <icosahedronGeometry args={[3.2, 1]} />
        <meshStandardMaterial color={C.leaf[tone % 4]} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[1.6, 7.8, 0.6]} castShadow>
        <icosahedronGeometry args={[2.2, 1]} />
        <meshStandardMaterial color={C.leaf[(tone + 2) % 4]} roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

function PineTree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position-y={1.2} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 2.4, 6]} />
        <meshStandardMaterial color={C.trunk} roughness={1} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position-y={3.6 + i * 2.4} castShadow>
          <coneGeometry args={[2.8 - i * 0.7, 3.6, 8]} />
          <meshStandardMaterial color={C.leaf[1]} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Bush({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position-y={0.9} castShadow>
        <icosahedronGeometry args={[1.3, 1]} />
        <meshStandardMaterial color={C.leaf[2]} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[1, 0.7, 0.3]} castShadow>
        <icosahedronGeometry args={[0.9, 1]} />
        <meshStandardMaterial color={C.leaf[0]} roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

function Cloud({ x, y, z, s = 1, speed = 0.4 }: { x: number; y: number; z: number; s?: number; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.x += dt * speed;
    if (ref.current.position.x > 140) ref.current.position.x = -140;
  });
  return (
    <group ref={ref} position={[x, y, z]} scale={s}>
      {[[0, 0, 0, 4], [4, -0.6, 0, 3], [-4, -0.8, 0, 2.8], [1.5, 1.8, 0, 2.8]].map(([cx, cy, cz, r], i) => (
        <mesh key={i} position={[cx, cy, cz]}>
          <sphereGeometry args={[r, 16, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function FarBuilding({ x, z, w, h }: { x: number; z: number; w: number; h: number }) {
  const rows = Math.floor(h / 4);
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, h / 2, 0]} s={[w, h, 10]} c={C.far} cast={false} />
      <Box p={[0, h + 0.4, 0]} s={[w + 0.6, 0.8, 10.6]} c="#cfd7dc" cast={false} />
      {Array.from({ length: rows }, (_, r) =>
        [-w / 4, w / 4].map((wx) => (
          <Box key={`${r}${wx}`} p={[wx, 3 + r * 4, 5.06]} s={[w / 3, 1.8, 0.1]} c="#b9ccd7" cast={false} />
        )),
      )}
    </group>
  );
}

function Street() {
  const dashes = Array.from({ length: 26 }, (_, i) => -125 + i * 10);
  return (
    <group>
      {/* foreground verge */}
      <Box p={[0, -0.25, 70]} s={[260, 0.5, 112]} c={C.grass} cast={false} />
      <Box p={[0, 0, 12.5]} s={[260, 0.3, 3]} c={C.sidewalk} cast={false} />
      <Box p={[0, 0.05, 10.8]} s={[260, 0.4, 0.4]} c={C.curb} cast={false} />
      {/* road */}
      <Box p={[0, -0.1, 5]} s={[260, 0.2, 11]} c={C.road} cast={false} />
      {dashes.map((x) => (
        <Box key={x} p={[x, 0.02, 5]} s={[5, 0.03, 0.35]} c={C.line} cast={false} />
      ))}
      <Box p={[0, 0.05, -0.8]} s={[260, 0.4, 0.4]} c={C.curb} cast={false} />
      <Box p={[0, 0, -2.5]} s={[260, 0.3, 3]} c={C.sidewalk} cast={false} />
      {/* lawns and hedge line */}
      <Box p={[0, -0.25, -45]} s={[260, 0.5, 84]} c={C.lawn} cast={false} />
      {/* driveways */}
      <Box p={[-12.5, 0.02, -2.5]} s={[7, 0.32, 3.2]} c={C.concrete} cast={false} />
    </group>
  );
}

export type SceneView = "street" | "map";

const FLIGHT_SECONDS = 2;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Street view: level, head-on camera so the house fronts face the viewer.
// Map view: high above, looking almost straight down. Changing `view` flies between them.
function CameraRig({ view }: { view: SceneView }) {
  const { camera, size, scene } = useThree();
  const progress = useRef(view === "map" ? 1 : 0);
  const look = useMemo(() => new THREE.Vector3(), []);
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, size]);

  useFrame((_, dt) => {
    const target = view === "map" ? 1 : 0;
    const step = reduceMotion ? 1 : dt / FLIGHT_SECONDS;
    progress.current =
      target > progress.current ? Math.min(target, progress.current + step) : Math.max(target, progress.current - step);
    const t = easeInOut(progress.current);

    const narrow = size.width / size.height < 1;
    const sx = narrow ? 8 : 2;
    const street = { pos: [sx, 7, narrow ? 50 : 34], look: [sx, 7, -12] };
    const top = narrow ? { pos: [2, 210, 26], look: [2, 0, 18] } : { pos: [-26, 110, -6], look: [-26, 0, -14] };

    camera.position.set(
      lerp(street.pos[0], top.pos[0], t),
      lerp(street.pos[1], top.pos[1], t),
      lerp(street.pos[2], top.pos[2], t),
    );
    look.set(lerp(street.look[0], top.look[0], t), lerp(street.look[1], top.look[1], t), lerp(street.look[2], top.look[2], t));
    camera.lookAt(look);

    // Push the haze back as the camera climbs so the map stays crisp.
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = lerp(70, 300, t);
      scene.fog.far = lerp(220, 600, t);
    }
  });
  return null;
}

export default function StreetScene({ view = "street" }: { view?: SceneView }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 10, 40], fov: 42, near: 1, far: 600 }}
      aria-label="Illustration of a street: a finished house next to a house under construction, with trees and a road"
    >
      <fog attach="fog" args={["#dcedf5", 70, 220]} />
      <CameraRig view={view} />
      <hemisphereLight args={["#e9f5ff", "#8fb36a", 1.2]} />
      <directionalLight
        position={[-40, 60, 35]}
        intensity={2.3}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.4}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />

      <Street />
      <FinishedHouse x={-20} z={-16} />
      <UnderConstruction x={20} z={-16} />
      <Mailbox x={-27} z={-4.6} />
      <Pickup p={[40, 0, 1.8]} />

      {/* trees and bushes */}
      <RoundTree x={1} z={-12} s={1.25} tone={0} />
      <PineTree x={-42} z={-20} s={1.5} />
      <RoundTree x={-52} z={-14} s={1.1} tone={1} />
      <RoundTree x={40} z={-22} s={1.3} tone={2} />
      <PineTree x={50} z={-28} s={1.4} />
      <RoundTree x={-4} z={-38} s={1.4} tone={3} />
      <RoundTree x={30} z={-44} s={1.5} tone={1} />
      <PineTree x={-30} z={-46} s={1.8} />
      <RoundTree x={-62} z={-40} s={1.6} tone={2} />
      <RoundTree x={26} z={19} s={1.6} tone={0} />
      <Bush x={-30} z={17} s={1.3} />
      <Bush x={-8} z={18} s={1} />
      <Bush x={12} z={20} s={1.2} />
      <Bush x={44} z={17} s={1.1} />
      <Bush x={-48} z={19} s={1.2} />
      {[-34, -26, -6, 8, 30, 36].map((x) => (
        <Bush key={x} x={x} z={-24} s={0.9} />
      ))}

      {/* distance */}
      <FarBuilding x={-26} z={-75} w={22} h={14} />
      <FarBuilding x={18} z={-85} w={26} h={20} />
      <FarBuilding x={60} z={-80} w={18} h={14} />
      <FarBuilding x={-70} z={-90} w={24} h={16} />

      <Cloud x={-60} y={46} z={-120} s={1.6} speed={0.5} />
      <Cloud x={10} y={54} z={-140} s={2} speed={0.35} />
      <Cloud x={80} y={44} z={-110} s={1.3} speed={0.45} />
      <Cloud x={-120} y={58} z={-150} s={2.2} speed={0.3} />
    </Canvas>
  );
}
