"use client";

import type { NearBuilding, NearRoad, Pt, Surroundings } from "@/lib/surroundings";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type KeepOut = (x: number, z: number) => boolean;

const STORY_TEX = 3.2;
const WALLS = ["#f2eee6", "#e9e2d3", "#d9dccf", "#c9d3d6", "#efe7da", "#cfc2ad", "#b9a58c", "#a8705a", "#dfe5e8", "#bfc8b5", "#e4d9c4"];
const BLOCK_WALLS = ["#d8d6d0", "#c4c7c9", "#e2ddd2", "#a9b1b8", "#cbbfae"];
const ROOFS = ["#4a4c4f", "#5b5148", "#3f4347", "#6c6a66", "#7d7466", "#56606a", "#8f9396", "#6a5444"];
const LEAVES = ["#4f6b35", "#5c7a3a", "#466230", "#6b8743", "#3f5a2c", "#58733a"];
const PATHS = new Set(["footway", "path", "cycleway", "pedestrian"]);
const STRIPED = new Set(["primary", "secondary", "tertiary", "trunk", "motorway"]);

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function pick<T>(list: T[], seed: number) {
  return list[Math.floor(seed * list.length) % list.length];
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, colors: string[], size = 1.6) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.random() * w, Math.random() * h, size * (0.5 + Math.random()), size * (0.5 + Math.random()));
  }
}

function centroid(ring: Pt[]) {
  let x = 0;
  let z = 0;
  for (const [px, pz] of ring) {
    x += px;
    z += pz;
  }
  return [x / ring.length, z / ring.length] as Pt;
}

function signedArea(ring: Pt[]) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    area += x1 * z2 - x2 * z1;
  }
  return area / 2;
}

function hull(points: Pt[]) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function orientedBox(ring: Pt[]) {
  const points = hull(ring);
  let best = { area: Infinity, cx: 0, cz: 0, ux: 1, uz: 0, L: 0, W: 0 };
  for (let i = 0; i < points.length; i += 1) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % points.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.01) continue;
    const ux = (x2 - x1) / len;
    const uz = (z2 - z1) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [px, pz] of points) {
      const u = px * ux + pz * uz;
      const v = -px * uz + pz * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) {
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const L = maxU - minU;
      const W = maxV - minV;
      const along = L >= W;
      best = {
        area,
        cx: cu * ux - cv * uz,
        cz: cu * uz + cv * ux,
        ux: along ? ux : -uz,
        uz: along ? uz : ux,
        L: Math.max(L, W),
        W: Math.min(L, W),
      };
    }
  }
  return best;
}

class Builder {
  positions: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];

  tri(a: number[], b: number[], c: number[], uvA: number[], uvB: number[], uvC: number[], color: THREE.Color) {
    this.positions.push(...a, ...b, ...c);
    this.uvs.push(...uvA, ...uvB, ...uvC);
    for (let i = 0; i < 3; i += 1) this.colors.push(color.r, color.g, color.b);
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function linear(hex: string) {
  return new THREE.Color(hex);
}

function buildingGeometry(buildings: NearBuilding[]) {
  const walls = new Builder();
  const caps = new Builder();
  const roofs = new Builder();

  for (const building of buildings) {
    let ring = building.ring;
    const area = signedArea(ring);
    if (Math.abs(area) < 6) continue;
    if (area < 0) ring = [...ring].reverse();
    const [cx, cz] = centroid(ring);
    const seed = hash(cx, cz);
    const h = building.height;
    const block = h > 9 || ["apartments", "commercial", "retail", "office", "school", "church", "university"].includes(building.kind);
    const wall = linear(pick(block ? BLOCK_WALLS : WALLS, seed));

    let run = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % ring.length];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const u1 = run / STORY_TEX;
      const u2 = (run + len) / STORY_TEX;
      const v = h / STORY_TEX;
      const a = [x1, 0, z1];
      const b = [x2, 0, z2];
      const c = [x2, h, z2];
      const d = [x1, h, z1];
      walls.tri(a, d, c, [u1, 0], [u1, v], [u2, v], wall);
      walls.tri(a, c, b, [u1, 0], [u2, v], [u2, 0], wall);
      run += len;
    }

    const box = orientedBox(ring);
    const fill = Math.abs(area) / (box.L * box.W || 1);
    const gable = !block && h <= 10 && fill > 0.72 && box.W > 3 && box.W < 22;
    const capColor = linear(block ? "#9a9894" : pick(ROOFS, hash(cz, cx))).multiplyScalar(0.9 + seed * 0.2);
    const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      const [ax, az] = ring[i];
      let [bx, bz] = ring[j];
      let [kx, kz] = ring[k];
      if ((bz - az) * (kx - ax) - (bx - ax) * (kz - az) < 0) {
        [bx, bz, kx, kz] = [kx, kz, bx, bz];
      }
      caps.tri([ax, h, az], [bx, h, bz], [kx, h, kz], [ax / 4, az / 4], [bx / 4, bz / 4], [kx / 4, kz / 4], capColor);
    }

    if (gable) {
      const roof = linear(pick(ROOFS, hash(cz, cx)));
      const o = 0.4;
      const L = box.L / 2 + o;
      const W = box.W / 2 + o;
      const rise = Math.min(3.4, box.W * 0.3);
      const vx = -box.uz;
      const vz = box.ux;
      const at = (s: number, t: number, y: number) => [box.cx + box.ux * s + vx * t, y, box.cz + box.uz * s + vz * t];
      const e1 = at(-L, -W, h - 0.08);
      const e2 = at(L, -W, h - 0.08);
      const e3 = at(L, W, h - 0.08);
      const e4 = at(-L, W, h - 0.08);
      const r1 = at(-L, 0, h + rise);
      const r2 = at(L, 0, h + rise);
      const slope = Math.hypot(W, rise) / 2;
      const center = [box.cx, h + rise * 0.3, box.cz];
      const face = (p: number[], q: number[], r: number[], up: number[], uq: number[], ur: number[]) => {
        const n = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]).cross(new THREE.Vector3(r[0] - p[0], r[1] - p[1], r[2] - p[2]));
        const m = [(p[0] + q[0] + r[0]) / 3 - center[0], (p[1] + q[1] + r[1]) / 3 - center[1], (p[2] + q[2] + r[2]) / 3 - center[2]];
        if (n.x * m[0] + n.y * m[1] + n.z * m[2] < 0) roofs.tri(p, r, q, up, ur, uq, roof);
        else roofs.tri(p, q, r, up, uq, ur, roof);
      };
      const s0 = -L / 2;
      const s1 = L / 2;
      face(e1, e2, r2, [s0, 0], [s1, 0], [s1, slope]);
      face(e1, r2, r1, [s0, 0], [s1, slope], [s0, slope]);
      face(e4, r1, r2, [s0, 0], [s0, slope], [s1, slope]);
      face(e4, r2, e3, [s0, 0], [s1, slope], [s1, 0]);
      face(e1, r1, e4, [-W / 2, 0], [0, slope], [W / 2, 0]);
      face(e2, e3, r2, [-W / 2, 0], [W / 2, 0], [0, slope]);
    }
  }
  return { walls: walls.geometry(), caps: caps.geometry(), roofs: roofs.geometry() };
}

function ribbon(paths: { path: Pt[]; width: number }[], y: number, vScale: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const { path, width } of paths) {
    if (path.length < 2) continue;
    const half = width / 2;
    const base = positions.length / 3;
    let along = 0;
    for (let i = 0; i < path.length; i += 1) {
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(path.length - 1, i + 1)];
      let dx = next[0] - prev[0];
      let dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      let nx = -dz;
      let nz = dx;
      if (i > 0 && i < path.length - 1) {
        const ax = path[i][0] - prev[0];
        const az = path[i][1] - prev[1];
        const al = Math.hypot(ax, az) || 1;
        const miter = Math.max(0.55, Math.abs((-az / al) * nx + (ax / al) * nz));
        nx /= miter;
        nz /= miter;
      }
      if (i > 0) along += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      const [px, pz] = path[i];
      positions.push(px + nx * half, y, pz + nz * half, px - nx * half, y, pz - nz * half);
      uvs.push(0, along / vScale, 1, along / vScale);
      if (i > 0) {
        const k = base + (i - 1) * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  for (let i = 0; i < normal.count; i += 1) normal.setXYZ(i, 0, 1, 0);
  geometry.computeBoundingSphere();
  return geometry;
}

function useTextures() {
  return useMemo(() => {
    const siding = canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = "#f6f3ee";
      ctx.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 11) {
        ctx.fillStyle = "rgba(0,0,0,0.07)";
        ctx.fillRect(0, y, 256, 2);
      }
      speckle(ctx, 256, 256, 1600, ["rgba(0,0,0,0.035)", "rgba(255,255,255,0.08)"]);
      ctx.fillStyle = "#fbfaf7";
      ctx.fillRect(84, 60, 88, 112);
      const glass = ctx.createLinearGradient(90, 66, 166, 166);
      glass.addColorStop(0, "#5d7486");
      glass.addColorStop(0.45, "#2f3d48");
      glass.addColorStop(0.55, "#8aa2b2");
      glass.addColorStop(1, "#26313a");
      ctx.fillStyle = glass;
      ctx.fillRect(91, 67, 74, 98);
      ctx.fillStyle = "#fbfaf7";
      ctx.fillRect(126, 67, 4, 98);
      ctx.fillRect(91, 113, 74, 4);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(80, 172, 96, 6);
    });
    const shingles = canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = "#cfcfcf";
      ctx.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 16; row += 1) {
        const offset = row % 2 ? 8 : 0;
        for (let col = -1; col < 17; col += 1) {
          const shade = 170 + Math.floor(Math.random() * 70);
          ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
          ctx.fillRect(col * 16 + offset, row * 16, 15, 14);
        }
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, row * 16 + 14, 256, 2);
      }
      speckle(ctx, 256, 256, 3000, ["rgba(0,0,0,0.12)", "rgba(255,255,255,0.12)"], 1.2);
    });
    shingles.repeat.set(0.5, 0.5);
    const gravel = canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = "#d9d9d6";
      ctx.fillRect(0, 0, 128, 128);
      speckle(ctx, 128, 128, 2600, ["rgba(0,0,0,0.12)", "rgba(255,255,255,0.25)", "rgba(80,70,60,0.12)"], 1.4);
    });
    const asphalt = (striped: boolean) =>
      canvasTexture(64, 256, (ctx) => {
        ctx.fillStyle = "#45484c";
        ctx.fillRect(0, 0, 64, 256);
        speckle(ctx, 64, 256, 2400, ["rgba(0,0,0,0.25)", "rgba(255,255,255,0.08)", "rgba(120,110,100,0.12)"], 1.2);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(24, 0, 16, 256);
        ctx.fillStyle = "rgba(235,232,225,0.55)";
        ctx.fillRect(2, 0, 2, 256);
        ctx.fillRect(60, 0, 2, 256);
        if (striped) {
          ctx.fillStyle = "#d9b13b";
          ctx.fillRect(30, 0, 1.5, 128);
          ctx.fillRect(33, 0, 1.5, 128);
        }
      });
    const concrete = canvasTexture(64, 128, (ctx) => {
      ctx.fillStyle = "#c9c6bf";
      ctx.fillRect(0, 0, 64, 128);
      speckle(ctx, 64, 128, 900, ["rgba(0,0,0,0.06)", "rgba(255,255,255,0.12)"], 1.2);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(0, 0, 64, 1.5);
      ctx.fillRect(0, 64, 64, 1.5);
    });
    return { siding, shingles, gravel, street: asphalt(false), arterial: asphalt(true), concrete };
  }, []);
}

export function GrassGround({ size = 1200 }: { size?: number }) {
  const material = useMemo(() => {
    const grass = canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = "#6e8c48";
      ctx.fillRect(0, 0, 256, 256);
      speckle(ctx, 256, 256, 9000, ["#5d7a3c", "#7c9a52", "#66843f", "#869f5a", "#56723a", "#8c9c5c"], 1.8);
    });
    grass.repeat.set(size / 5, size / 5);
    const mat = new THREE.MeshStandardMaterial({ map: grass, roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vGroundPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vGroundPos;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float gFbm(vec2 p) { return gNoise(p) * 0.65 + gNoise(p * 2.05) * 0.35; }`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
float gMacro = gFbm(vGroundPos.xz * 0.02);
float gDry = gNoise(vGroundPos.xz * 0.055 + 11.0);
diffuseColor.rgb *= mix(0.82, 1.12, gMacro);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.07, 0.74), smoothstep(0.55, 0.82, gDry) * 0.45);`,
        );
    };
    mat.customProgramCacheKey = () => "grass-ground-v2";
    return mat;
  }, [size]);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow material={material}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}

export function Neighborhood({ data, keepOut }: { data: Surroundings; keepOut: KeepOut }) {
  const textures = useTextures();

  const buildings = useMemo(
    () => data.buildings.filter((building) => !building.ring.some(([x, z]) => keepOut(x, z)) && !keepOut(...centroid(building.ring))),
    [data.buildings, keepOut],
  );
  const geometry = useMemo(() => buildingGeometry(buildings), [buildings]);

  const roads = useMemo(() => {
    const drive = data.roads.filter((road) => !PATHS.has(road.kind));
    const walk = data.roads.filter((road) => PATHS.has(road.kind));
    const sidewalkFor = drive.filter((road) => road.kind !== "service");
    return {
      arterial: ribbon(drive.filter((road) => STRIPED.has(road.kind)), 0.05, 6),
      street: ribbon(drive.filter((road) => !STRIPED.has(road.kind)), 0.05, 6),
      curb: ribbon(sidewalkFor.map((road) => ({ path: road.path, width: road.width + 0.6 })), 0.04, 6),
      sidewalk: ribbon(
        [...sidewalkFor.map((road) => ({ path: road.path, width: road.width + 5.2 })), ...walk.map((road: NearRoad) => ({ path: road.path, width: Math.max(1.6, road.width) }))],
        0.03,
        3,
      ),
    };
  }, [data.roads]);

  useLayoutEffect(
    () => () => {
      geometry.walls.dispose();
      geometry.caps.dispose();
      geometry.roofs.dispose();
    },
    [geometry],
  );

  return (
    <group>
      <mesh geometry={roads.sidewalk} receiveShadow renderOrder={1}>
        <meshStandardMaterial map={textures.concrete} roughness={0.92} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={roads.curb} receiveShadow renderOrder={2}>
        <meshStandardMaterial color="#b9b5ad" roughness={0.9} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={roads.street} receiveShadow renderOrder={3}>
        <meshStandardMaterial map={textures.street} roughness={0.88} depthWrite={false} polygonOffset polygonOffsetFactor={-3} />
      </mesh>
      <mesh geometry={roads.arterial} receiveShadow renderOrder={4}>
        <meshStandardMaterial map={textures.arterial} roughness={0.85} depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
      </mesh>
      <mesh geometry={geometry.walls} castShadow receiveShadow>
        <meshStandardMaterial map={textures.siding} vertexColors roughness={0.82} />
      </mesh>
      <mesh geometry={geometry.caps} castShadow receiveShadow>
        <meshStandardMaterial map={textures.gravel} vertexColors roughness={0.95} />
      </mesh>
      <mesh geometry={geometry.roofs} castShadow receiveShadow>
        <meshStandardMaterial map={textures.shingles} vertexColors roughness={0.78} />
      </mesh>
      <Trees trees={data.trees} keepOut={keepOut} />
    </group>
  );
}

function Trees({ trees, keepOut }: { trees: Surroundings["trees"]; keepOut: KeepOut }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const tufts = useRef<THREE.InstancedMesh>(null);
  const kept = useMemo(() => trees.filter(([x, z]) => !keepOut(x, z)), [trees, keepOut]);
  const parts = useMemo(() => {
    const crown = new THREE.IcosahedronGeometry(1, 2);
    const position = crown.getAttribute("position");
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      v.fromBufferAttribute(position, i);
      const lump =
        1 +
        0.14 * Math.sin(v.x * 4.1 + v.y * 2.3) * Math.cos(v.z * 3.7 - v.y * 1.9) +
        0.07 * Math.sin(v.x * 9.3 - v.z * 8.1 + v.y * 5.7) +
        0.035 * Math.sin(v.x * 21 + v.y * 17 + v.z * 19);
      v.multiplyScalar(lump);
      if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.4;
      position.setXYZ(i, v.x, v.y, v.z);
    }
    crown.computeVertexNormals();
    const foliage = canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = "#c8c8c8";
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1400; i += 1) {
        const shade = 120 + Math.floor(Math.random() * 135);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * 128, Math.random() * 128, 1.2 + Math.random() * 2, 0.8 + Math.random() * 1.2, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    foliage.repeat.set(3, 2);
    return {
      trunk: new THREE.CylinderGeometry(0.14, 0.24, 1, 7).translate(0, 0.5, 0),
      crown,
      bark: new THREE.MeshStandardMaterial({ color: "#5a4636", roughness: 0.95 }),
      leaves: new THREE.MeshStandardMaterial({ map: foliage, roughness: 0.88 }),
    };
  }, []);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    kept.forEach(([x, z, s], index) => {
      const seed = hash(x, z);
      const tall = 2.2 + seed * 1.6;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, seed * Math.PI * 2, 0);
      dummy.scale.set(s, tall * s, s);
      dummy.updateMatrix();
      trunks.current?.setMatrixAt(index, dummy.matrix);

      const spread = (2.6 + seed * 1.4) * s;
      dummy.position.set(x, tall * s + spread * 0.45, z);
      dummy.scale.set(spread, spread * (0.62 + seed * 0.2), spread);
      dummy.updateMatrix();
      crowns.current?.setMatrixAt(index, dummy.matrix);
      tint.set(pick(LEAVES, seed)).offsetHSL((hash(z, x) - 0.5) * 0.03, 0, (hash(x + 3, z) - 0.5) * 0.08);
      crowns.current?.setColorAt(index, tint);

      const angle = seed * Math.PI * 6;
      dummy.position.set(x + Math.cos(angle) * spread * 0.5, tall * s + spread * 0.75, z + Math.sin(angle) * spread * 0.5);
      dummy.scale.set(spread * 0.62, spread * 0.48, spread * 0.62);
      dummy.updateMatrix();
      tufts.current?.setMatrixAt(index, dummy.matrix);
      tufts.current?.setColorAt(index, tint.offsetHSL(0, 0, 0.04));
    });
    for (const mesh of [trunks.current, crowns.current, tufts.current]) {
      if (!mesh) continue;
      mesh.count = kept.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [kept]);

  const capacity = Math.max(1, trees.length);
  return (
    <group>
      <instancedMesh ref={trunks} args={[parts.trunk, parts.bark, capacity]} castShadow />
      <instancedMesh ref={crowns} args={[parts.crown, parts.leaves, capacity]} />
      <instancedMesh ref={tufts} args={[parts.crown, parts.leaves, capacity]} />
    </group>
  );
}

export function lotPlacement(roads: NearRoad[], padW: number, padD: number) {
  let best = { d: Infinity, px: 0, pz: 0, width: 0, nx: 0, nz: 1 };
  for (const road of roads) {
    if (PATHS.has(road.kind)) continue;
    for (let i = 0; i < road.path.length - 1; i += 1) {
      const [ax, az] = road.path[i];
      const [bx, bz] = road.path[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, (-ax * dx - az * dz) / len2));
      const px = ax + t * dx;
      const pz = az + t * dz;
      const d = Math.hypot(px, pz);
      if (d < best.d) {
        const len = Math.sqrt(len2);
        best = { d, px, pz, width: road.width, nx: -dz / len, nz: dx / len };
      }
    }
  }
  if (!Number.isFinite(best.d)) return { x: 0, z: 0, angle: 0 };
  let dirX = best.d > 0.5 ? best.px / best.d : best.nx;
  let dirZ = best.d > 0.5 ? best.pz / best.d : best.nz;
  const norm = Math.hypot(dirX, dirZ) || 1;
  dirX /= norm;
  dirZ /= norm;
  const need = padD / 2 + best.width / 2 + 3.5;
  const shift = Math.max(0, need - best.d);
  return { x: -dirX * shift, z: -dirZ * shift, angle: Math.atan2(dirX, dirZ) };
}

export function padKeepOut(place: { x: number; z: number; angle: number }, padW: number, padD: number, margin: number): KeepOut {
  const cos = Math.cos(place.angle);
  const sin = Math.sin(place.angle);
  return (x, z) => {
    const dx = x - place.x;
    const dz = z - place.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    return Math.abs(lx) < padW / 2 + margin && Math.abs(lz) < padD / 2 + margin;
  };
}
