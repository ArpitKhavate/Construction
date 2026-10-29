import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { DesignBoard, DesignPhoto, Spot } from "@/lib/types";

// Same Google Maps Scraper as the builder lookup, with the place photo add-on turned on.
const ACTOR = "compass~crawler-google-places";
const ACTOR_TIMEOUT_S = 100;
const PLACES_PER_SEARCH = 4;
const IMAGES_PER_PLACE = 6;
const MAX_PHOTOS = 18;
const SEARCHES = { exterior: "custom home builder", interior: "interior designer" } as const;
const MEDIA_DIR = path.join(process.cwd(), ".data", "renders");
const CACHE_PATH = path.join(process.cwd(), ".data", "design-cache.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Place = {
  title?: string;
  url?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
};

type Candidate = { url: string; place: string; sourceUrl: string | null };

const inflight = new Map<string, Promise<DesignBoard>>();

export const DESIGN_STEPS = [
  { step: "Scrape", note: "Apify Google Maps Scraper pulled place photos from Austin custom home builders and interior designers near the lot." },
  { step: "Levels", note: "Auto-levels stretch each photo between its 1st and 99th percentile." },
  { step: "HDR tone", note: "Local contrast (CLAHE, 8x8 tiles, slope 2) lifts shadows and holds highlights, the look of a bracketed HDR merge." },
  { step: "Color", note: "Brightness 1.03 and saturation 1.12, then an unsharp pass with sigma 0.7." },
  { step: "Sort", note: "Photos with sky across the top of the frame are filed as exterior, the rest as interior." },
  { step: "Palette", note: "Five colors per photo by k-means on a 48x48 thumbnail. The 3D builder paints walls, roof, trim, floors, and furniture from them." },
];

function areaKey(spot: Pick<Spot, "lat" | "lng">) {
  return `${spot.lat.toFixed(2)}_${spot.lng.toFixed(2)}`.replace(/[^\w]/g, "_");
}

function largeImage(url: string) {
  // Google photo URLs end in a size suffix such as =w408-h306-k-no. Ask for a larger copy.
  return url.replace(/=w\d+-h\d+[^/]*$/, "=w1280-h960-k-no").replace(/=s\d+[^/]*$/, "=s1280");
}

async function scrapePhotos(spot: Pick<Spot, "lat" | "lng">): Promise<Candidate[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("Set APIFY_API_TOKEN in .env.local to scrape design photos.");
  const url = new URL(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`);
  url.searchParams.set("timeout", String(ACTOR_TIMEOUT_S));
  url.searchParams.set("clean", "true");
  url.searchParams.set("fields", "title,url,imageUrl,imageUrls");
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      searchStringsArray: [SEARCHES.exterior, SEARCHES.interior],
      customGeolocation: { type: "Point", coordinates: [spot.lng, spot.lat], radiusKm: 15 },
      maxCrawledPlacesPerSearch: PLACES_PER_SEARCH,
      maxImages: IMAGES_PER_PLACE,
      language: "en",
      countryCode: "us",
    }),
    signal: AbortSignal.timeout((ACTOR_TIMEOUT_S + 15) * 1000),
  });
  if (!response.ok) throw new Error(`Apify returned ${response.status}.`);
  const places = (await response.json()) as Place[];
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const place of places) {
    const urls = [...(place.imageUrls ?? []), ...(place.imageUrl ? [place.imageUrl] : [])];
    for (const raw of urls) {
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      out.push({ url: largeImage(raw), place: place.title ?? "Google Maps place", sourceUrl: place.url ?? null });
    }
  }
  return out;
}

function hex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

async function paletteOf(image: Buffer) {
  const { data } = await sharp(image).resize(48, 48, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 3) pixels.push([data[i], data[i + 1], data[i + 2]]);
  const k = 5;
  let centers = Array.from({ length: k }, (_, index) => pixels[Math.floor(((index + 0.5) / k) * pixels.length)]);
  let counts = new Array<number>(k).fill(0);
  for (let pass = 0; pass < 8; pass += 1) {
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    counts = new Array<number>(k).fill(0);
    for (const pixel of pixels) {
      let best = 0;
      let bestDistance = Infinity;
      centers.forEach((center, index) => {
        const distance = (pixel[0] - center[0]) ** 2 + (pixel[1] - center[1]) ** 2 + (pixel[2] - center[2]) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      counts[best] += 1;
      sums[best][0] += pixel[0];
      sums[best][1] += pixel[1];
      sums[best][2] += pixel[2];
    }
    centers = centers.map((center, index) =>
      counts[index] ? ([sums[index][0] / counts[index], sums[index][1] / counts[index], sums[index][2] / counts[index]] as [number, number, number]) : center,
    );
  }
  return centers
    .map((center, index) => ({ center, count: counts[index] }))
    .sort((a, b) => b.count - a.count)
    .map(({ center }) => hex(center[0], center[1], center[2]));
}

async function hasSky(image: Buffer) {
  const { data, info } = await sharp(image).resize(60, 45, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sky = 0;
  let total = 0;
  const rows = Math.round(info.height * 0.22);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 3;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      total += 1;
      const blue = b > 120 && b > r + 12 && b >= g - 6;
      const overcast = r > 200 && g > 200 && b > 205 && Math.abs(r - b) < 18;
      if (blue || overcast) sky += 1;
    }
  }
  return sky / total > 0.38;
}

async function processPhoto(candidate: Candidate, key: string, index: number): Promise<DesignPhoto | null> {
  const response = await fetch(candidate.url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) return null;
  const raw = Buffer.from(await response.arrayBuffer());
  const before = await sharp(raw).rotate().resize(1024, 720, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer();
  const after = await sharp(before)
    .normalise({ lower: 1, upper: 99 })
    .clahe({ width: 8, height: 8, maxSlope: 2 })
    .modulate({ brightness: 1.03, saturation: 1.12 })
    .sharpen({ sigma: 0.7 })
    .jpeg({ quality: 88 })
    .toBuffer();
  const kind = (await hasSky(before)) ? "exterior" : "interior";
  const id = `design-${key}-${index}`;
  await writeFile(path.join(MEDIA_DIR, `${id}-before.jpg`), before);
  await writeFile(path.join(MEDIA_DIR, `${id}-after.jpg`), after);
  return {
    id,
    kind,
    before: `${id}-before.jpg`,
    after: `${id}-after.jpg`,
    palette: await paletteOf(after),
    place: candidate.place,
    sourceUrl: candidate.sourceUrl,
  };
}

type CacheFile = Record<string, { savedAt: number; board: DesignBoard }>;

async function readCache(key: string) {
  try {
    const parsed = JSON.parse(await readFile(CACHE_PATH, "utf8")) as CacheFile;
    const hit = parsed[key];
    if (hit && Date.now() - hit.savedAt < CACHE_TTL_MS && hit.board.photos.length) return hit.board;
  } catch {
    // No cache yet.
  }
  return null;
}

async function writeCache(key: string, board: DesignBoard) {
  let parsed: CacheFile = {};
  try {
    parsed = JSON.parse(await readFile(CACHE_PATH, "utf8")) as CacheFile;
  } catch {
    // Start a fresh cache file.
  }
  parsed[key] = { savedAt: Date.now(), board };
  await writeFile(CACHE_PATH, JSON.stringify(parsed));
}

async function build(spot: Pick<Spot, "lat" | "lng">, key: string): Promise<DesignBoard> {
  const candidates = await scrapePhotos(spot);
  if (!candidates.length) throw new Error("Apify returned no place photos near this lot.");
  await mkdir(MEDIA_DIR, { recursive: true });
  const picked = candidates.slice(0, MAX_PHOTOS + 6);
  const results = await Promise.all(picked.map((candidate, index) => processPhoto(candidate, key, index).catch(() => null)));
  const photos = results.filter((photo): photo is DesignPhoto => photo !== null).slice(0, MAX_PHOTOS);
  if (!photos.length) throw new Error("None of the scraped photos could be downloaded.");
  const board: DesignBoard = { source: "live", scrapedAt: new Date().toISOString(), photos, steps: DESIGN_STEPS };
  await writeCache(key, board).catch(() => undefined);
  return board;
}

export async function designBoard(spot: Pick<Spot, "lat" | "lng">, fresh = false): Promise<DesignBoard> {
  const key = areaKey(spot);
  if (!fresh) {
    const cached = await readCache(key);
    if (cached) return { ...cached, source: "cache" };
  }
  let job = inflight.get(key);
  if (!job) {
    job = build(spot, key).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}
