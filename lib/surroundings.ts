import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DATA_DIR = path.join(process.cwd(), ".data");
const RENDER_DIR = path.join(DATA_DIR, "renders");
const CACHE_DIR = path.join(DATA_DIR, "surroundings");
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const USER_AGENT = "lotline-hackathon/0.1 (Austin site builder demo)";
const BUILDING_RADIUS = 220;
const ROAD_RADIUS = 260;
const STORY_M = 3.2;

export type Pt = [number, number];
export type NearBuilding = { ring: Pt[]; height: number; kind: string };
export type NearRoad = { path: Pt[]; width: number; kind: string };
export type Surroundings = {
  source: "live" | "cache";
  fetchedAt: string;
  buildings: NearBuilding[];
  roads: NearRoad[];
  trees: [number, number, number][];
  steps: { step: string; note: string }[];
};

type OsmWay = { type: string; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

const ROAD_WIDTH: Record<string, number> = {
  motorway: 14,
  trunk: 12,
  primary: 11,
  secondary: 10,
  tertiary: 8.5,
  residential: 7,
  unclassified: 7,
  living_street: 5.5,
  service: 4.5,
  primary_link: 7,
  secondary_link: 7,
  tertiary_link: 6,
  footway: 1.6,
  path: 1.4,
  cycleway: 2,
  pedestrian: 3,
};

function toLocal(lat0: number, lng0: number) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return (lat: number, lng: number): Pt => [round((lng - lng0) * kx), round(-(lat - lat0) * 110540)];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function heightOf(tags: Record<string, string>) {
  const height = Number.parseFloat(tags.height ?? "");
  if (Number.isFinite(height) && height > 1) return Math.min(height, 90);
  const levels = Number.parseFloat(tags["building:levels"] ?? "");
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels, 28) * STORY_M + 0.6;
  if (["garage", "garages", "shed", "carport", "roof"].includes(tags.building)) return 2.6;
  return STORY_M + 0.6;
}

async function overpass(lat: number, lng: number) {
  const query = `[out:json][timeout:90];(way["building"](around:${BUILDING_RADIUS},${lat},${lng});way["highway"](around:${ROAD_RADIUS},${lat},${lng}););out geom;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 95000);
  const ask = async (url: string) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT, Accept: "application/json" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Overpass ${new URL(url).host} returned ${response.status}.`);
    const data = (await response.json()) as { elements?: OsmWay[] };
    if (!data.elements?.length) throw new Error(`Overpass ${new URL(url).host} returned no ways.`);
    return data.elements;
  };
  try {
    return await Promise.any(ENDPOINTS.map(ask));
  } catch {
    throw new Error("OpenStreetMap's Overpass servers did not answer in time.");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function pointInRing(x: number, z: number, ring: Pt[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToPath(x: number, z: number, line: Pt[]) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

async function canopy(renderName: string | null, lat: number, lng: number, buildings: NearBuilding[], roads: NearRoad[]) {
  if (!renderName) return [];
  let image: Buffer;
  try {
    image = await readFile(path.join(RENDER_DIR, renderName));
  } catch {
    return [];
  }
  const zoom = 18;
  const scale = 2 ** zoom;
  const px = ((lng + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const py = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  const pixelX = (px - (Math.floor(px) - 1)) * 256;
  const pixelY = (py - (Math.floor(py) - 1)) * 256;
  const crop = 640;
  const cropLeft = Math.max(0, Math.min(768 - crop, Math.round(pixelX - crop / 2)));
  const cropTop = Math.max(0, Math.min(768 - crop, Math.round(pixelY - crop / 2)));
  const centerX = pixelX - cropLeft;
  const centerY = pixelY - cropTop;
  const metersPerPixel = (156543.03 * Math.cos(latRad)) / scale;

  const grid = 160;
  const { data } = await sharp(image).resize(grid, grid).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const step = crop / grid;
  const isTree = (gx: number, gy: number) => {
    if (gx < 0 || gy < 0 || gx >= grid || gy >= grid) return false;
    const o = (gy * grid + gx) * 3;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    return g > r * 1.04 && g > b * 1.02 && lum < 118 && lum > 18;
  };

  const trees: [number, number, number][] = [];
  const cell = 3;
  for (let gy = 0; gy < grid; gy += cell) {
    for (let gx = 0; gx < grid; gx += cell) {
      let hits = 0;
      for (let dy = 0; dy < cell; dy += 1) for (let dx = 0; dx < cell; dx += 1) if (isTree(gx + dx, gy + dy)) hits += 1;
      if (hits < 5) continue;
      const jitterX = (hash(gx, gy) - 0.5) * cell;
      const jitterY = (hash(gy, gx) - 0.5) * cell;
      const x = round(((gx + cell / 2 + jitterX) * step - centerX) * metersPerPixel);
      const z = round(((gy + cell / 2 + jitterY) * step - centerY) * metersPerPixel);
      if (buildings.some((building) => pointInRing(x, z, building.ring))) continue;
      if (roads.some((road) => distToPath(x, z, road.path) < road.width / 2 + 1.5)) continue;
      const size = round(0.75 + hash(x, z) * 0.6 + (hits / (cell * cell)) * 0.25);
      trees.push([x, z, size]);
    }
  }
  return trees.slice(0, 900);
}

function cachePath(lat: number, lng: number) {
  return path.join(CACHE_DIR, `${lat.toFixed(5)}_${lng.toFixed(5)}.json`);
}

const inflight = new Map<string, Promise<Surroundings>>();

export function surroundings(spot: { lat: number; lng: number }, renderName: string | null) {
  const key = cachePath(spot.lat, spot.lng);
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = build(spot, renderName, key).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function build(spot: { lat: number; lng: number }, renderName: string | null, file: string): Promise<Surroundings> {
  try {
    const cached = JSON.parse(await readFile(file, "utf8")) as Surroundings;
    return { ...cached, source: "cache" };
  } catch {}

  const local = toLocal(spot.lat, spot.lng);
  const ways = await overpass(spot.lat, spot.lng);
  const buildings: NearBuilding[] = [];
  const roads: NearRoad[] = [];
  for (const way of ways) {
    const tags = way.tags ?? {};
    const geometry = way.geometry ?? [];
    if (geometry.length < 2) continue;
    const points = geometry.map((node) => local(node.lat, node.lon));
    if (tags.building && points.length >= 4) {
      const ring = points.slice(0, -1);
      buildings.push({ ring, height: round(heightOf(tags)), kind: tags.building });
    } else if (tags.highway && ROAD_WIDTH[tags.highway]) {
      if (tags.highway === "footway" && tags.footway === "sidewalk") continue;
      roads.push({ path: points, width: ROAD_WIDTH[tags.highway], kind: tags.highway });
    }
  }
  const trees = await canopy(renderName, spot.lat, spot.lng, buildings, roads);

  const result: Surroundings = {
    source: "live",
    fetchedAt: new Date().toISOString(),
    buildings,
    roads,
    trees,
    steps: [
      {
        step: "Footprints",
        note: `${buildings.length} building outlines within ${BUILDING_RADIUS} m from OpenStreetMap. Heights use the mapped height or levels; unmapped buildings get one story.`,
      },
      { step: "Streets", note: `${roads.length} street and path centerlines, widened by street class.` },
      {
        step: "Canopy",
        note: `${trees.length} trees placed where the Esri aerial shows dark green canopy, away from buildings and streets. Species and exact size are not known.`,
      },
    ],
  };
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(result));
  return result;
}
