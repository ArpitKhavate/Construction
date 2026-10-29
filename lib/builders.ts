import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import fallback from "@/lib/builders-fallback.json";
import type { Builder, ChecklistItem, Constraints, OutreachDraft, Spot } from "@/lib/types";

// Google Maps Scraper on Apify. Five places with no add-ons costs about two cents a run.
const ACTOR = "compass~crawler-google-places";
const CACHE_PATH = path.join(process.cwd(), ".data", "builders.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LIVE_WAIT_MS = 15000;
const ACTOR_TIMEOUT_S = 120;
const COUNT = 5;

export type BuilderSearch = "adu" | "home" | "commercial";
export type BuilderSource = "cache" | "live" | "bundled";

const TERMS: Record<BuilderSearch, string> = {
  adu: "ADU builder",
  home: "home builder",
  commercial: "general contractor",
};

type Place = {
  title?: string;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  totalScore?: number | null;
  reviewsCount?: number | null;
  url?: string | null;
  permanentlyClosed?: boolean;
};

type CacheFile = Record<string, { savedAt: number; builders: Builder[] }>;

const inflight = new Map<string, Promise<Builder[] | null>>();

export function builderSearch(constraints: Constraints): BuilderSearch {
  if (constraints.kind === "commercial") return "commercial";
  if (constraints.adu) return "adu";
  return "home";
}

// The spot address rarely carries a ZIP, so the area key falls back to a ~2 km grid cell.
function areaKey(spot: Spot) {
  const zip = spot.address?.match(/\b7\d{4}\b/)?.[0];
  return zip ?? `${spot.lat.toFixed(2)},${spot.lng.toFixed(2)}`;
}

function toBuilder(place: Place): Builder | null {
  if (!place.title || place.permanentlyClosed) return null;
  return {
    name: place.title,
    phone: place.phone ?? null,
    website: place.website ?? null,
    address: place.address ?? null,
    rating: typeof place.totalScore === "number" ? place.totalScore : null,
    reviews: typeof place.reviewsCount === "number" ? place.reviewsCount : null,
    mapsUrl: place.url ?? null,
  };
}

async function readCache(key: string): Promise<Builder[] | null> {
  try {
    const parsed = JSON.parse(await readFile(CACHE_PATH, "utf8")) as CacheFile;
    const hit = parsed[key];
    if (hit && Date.now() - hit.savedAt < CACHE_TTL_MS && hit.builders.length) return hit.builders;
  } catch {
    // No cache yet.
  }
  return null;
}

async function writeCache(key: string, builders: Builder[]) {
  let parsed: CacheFile = {};
  try {
    parsed = JSON.parse(await readFile(CACHE_PATH, "utf8")) as CacheFile;
  } catch {
    // Start a fresh cache file.
  }
  parsed[key] = { savedAt: Date.now(), builders };
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(parsed));
}

export async function scrapeBuilders(search: BuilderSearch, spot: Pick<Spot, "lat" | "lng">): Promise<Builder[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not set.");
  const url = new URL(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`);
  url.searchParams.set("timeout", String(ACTOR_TIMEOUT_S));
  url.searchParams.set("clean", "true");
  url.searchParams.set("fields", "title,phone,website,address,totalScore,reviewsCount,url,permanentlyClosed");
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      searchStringsArray: [TERMS[search]],
      customGeolocation: { type: "Point", coordinates: [spot.lng, spot.lat], radiusKm: 8 },
      maxCrawledPlacesPerSearch: COUNT,
      language: "en",
      countryCode: "us",
    }),
    signal: AbortSignal.timeout((ACTOR_TIMEOUT_S + 15) * 1000),
  });
  if (!response.ok) throw new Error(`Apify returned ${response.status}.`);
  const places = (await response.json()) as Place[];
  return places
    .map(toBuilder)
    .filter((item): item is Builder => item !== null)
    .slice(0, COUNT);
}

function bundled(search: BuilderSearch): Builder[] {
  const sets = fallback as Record<string, Builder[]>;
  return (sets[search] ?? sets.home ?? sets.adu ?? []).slice(0, COUNT);
}

// Cache, then a live scrape capped at 15s, then the bundled list. A slow scrape keeps
// running after the timeout and fills the cache for the next run. This never throws.
export async function findBuilders(
  constraints: Constraints,
  spot: Spot,
): Promise<{ builders: Builder[]; source: BuilderSource }> {
  const search = builderSearch(constraints);
  const key = `${search}:${areaKey(spot)}`;
  const cached = await readCache(key);
  if (cached) return { builders: cached, source: "cache" };

  if (process.env.APIFY_API_TOKEN) {
    let live = inflight.get(key);
    if (!live) {
      live = scrapeBuilders(search, spot)
        .then(async (builders) => {
          if (builders.length) await writeCache(key, builders).catch(() => undefined);
          return builders.length ? builders : null;
        })
        .catch(() => null)
        .finally(() => inflight.delete(key));
      inflight.set(key, live);
    }
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LIVE_WAIT_MS).unref?.());
    const result = await Promise.race([live, timeout]);
    if (result) return { builders: result, source: "live" };
  }

  return { builders: bundled(search), source: "bundled" };
}

export function builderLine(builder: Builder) {
  const score =
    builder.rating != null
      ? `${builder.rating.toFixed(1)} stars${builder.reviews != null ? ` (${builder.reviews} reviews)` : ""}`
      : "no rating yet";
  return [builder.name, score, builder.phone ?? "no phone listed"].join(" · ");
}

export function withBuilderItem(items: ChecklistItem[], builders: Builder[] | undefined): ChecklistItem[] {
  if (!builders?.length) return items;
  const first = builders[0];
  return [
    ...items,
    {
      n: items.length + 1,
      title: "Talk to two or three local builders",
      detail: `Builders near this spot on Google Maps: ${builders.map(builderLine).join("; ")}. Ask each one whether they have built this kind of project in Austin and what their last permit took.`,
      why: "A builder who has been through Austin permitting can tell you early what this lot will really cost and how long review takes.",
      href: first.website ?? first.mapsUrl ?? undefined,
      hrefLabel: first.website ? `${first.name} website` : `${first.name} on Google Maps`,
    },
  ];
}

export function withBuilderEmail(email: OutreachDraft, builders: Builder[] | undefined): OutreachDraft {
  if (!builders?.length) return email;
  const lines = builders.slice(0, 3).map((builder) => `- ${builderLine(builder)}`);
  const section = ["Builders I'm considering:", ...lines, ""];
  const body = email.body.split("\n");
  const closing = body.lastIndexOf("Thank you");
  // The section goes above the sign-off, after the blank line that precedes it.
  if (closing > 0) body.splice(closing, 0, ...section);
  else body.push("", ...section);
  return { ...email, body: body.join("\n") };
}
