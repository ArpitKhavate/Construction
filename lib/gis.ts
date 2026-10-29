import { ANCHORS } from "@/lib/anchors";
import bundledAnchors from "@/lib/anchor-facts-fallback.json";
import type { AnchorFact, FieldReport, LayerCheck, PermitHit } from "@/lib/types";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const GIS = "https://maps.austintexas.gov/arcgis/rest/services";
const CACHE_PATH = path.join(process.cwd(), ".data", "anchor-facts.json");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type Feature = { attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } };

const clearCheck = (): LayerCheck => ({ state: "clear", label: null, detail: null });
const unknownCheck = (detail: string): LayerCheck => ({ state: "unknown", label: null, detail });

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const current = next;
      next += 1;
      results[current] = await fn(items[current]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function queryLayer(
  service: string,
  layer: number,
  params: Record<string, string>,
): Promise<Feature[]> {
  const url = new URL(`${GIS}/${service}/MapServer/${layer}/query`);
  url.searchParams.set("f", "json");
  url.searchParams.set("where", "1=1");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${service} layer ${layer} returned ${response.status}`);
  const data = (await response.json()) as { error?: { message?: string }; features?: Feature[] };
  if (data.error) throw new Error(data.error.message || `${service} query failed`);
  return data.features ?? [];
}

function pointParams(lng: number, lat: number, extra: Record<string, string> = {}) {
  return {
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    returnGeometry: "false",
    ...extra,
  };
}

async function layerCheck(
  service: string,
  layer: number,
  lng: number,
  lat: number,
  distanceMeters?: number,
): Promise<LayerCheck> {
  try {
    const extra: Record<string, string> = { outFields: "*", resultRecordCount: "5" };
    if (distanceMeters) {
      extra.distance = String(distanceMeters);
      extra.units = "esriSRUnit_Meter";
    }
    const features = await queryLayer(service, layer, pointParams(lng, lat, extra));
    if (!features.length) return clearCheck();
    const labels = features
      .map((feature) => {
        const attrs = feature.attributes ?? {};
        const value =
          attrs.FLOOD_ZONE ??
          attrs.NAME ??
          attrs.ZONE_NAME ??
          attrs.DISTRICT ??
          attrs.ZONING_ZTYPE ??
          attrs.FULL_NAME;
        return value == null ? null : String(value);
      })
      .filter((value): value is string => Boolean(value));
    const unique = [...new Set(labels)];
    return {
      state: "hit",
      label: unique[0] ?? "mapped",
      detail: unique.slice(0, 3).join(", ") || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The layer did not answer";
    return unknownCheck(message);
  }
}

function metersBetween(lng1: number, lat1: number, lng2: number, lat2: number) {
  const dx = (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  const dy = (lat1 - lat2) * 110540;
  return Math.hypot(dx, dy);
}

async function nearestAddress(lng: number, lat: number): Promise<string | null> {
  const features = await queryLayer(
    "Shared/Property",
    0,
    pointParams(lng, lat, {
      distance: "140",
      units: "esriSRUnit_Meter",
      outFields: "FULL_STREET_NAME",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "12",
    }),
  );
  let best: { name: string; distance: number } | null = null;
  for (const feature of features) {
    const name = feature.attributes?.FULL_STREET_NAME;
    const x = feature.geometry?.x;
    const y = feature.geometry?.y;
    if (typeof name !== "string" || typeof x !== "number" || typeof y !== "number") continue;
    const distance = metersBetween(lng, lat, x, y);
    if (!best || distance < best.distance) best = { name, distance };
  }
  return best?.name ?? null;
}

async function readZoning(lng: number, lat: number) {
  const features = await queryLayer(
    "Shared/Zoning_1",
    0,
    pointParams(lng, lat, { outFields: "ZONING_ZTYPE,ZONING_BASE", resultRecordCount: "3" }),
  );
  const first = features[0]?.attributes;
  if (!first) return { zoning: null, zoningBase: null };
  const zoning = first.ZONING_ZTYPE == null ? null : String(first.ZONING_ZTYPE);
  const zoningBase = first.ZONING_BASE == null ? null : String(first.ZONING_BASE);
  return { zoning, zoningBase };
}

async function readPermits(lng: number, lat: number): Promise<PermitHit[]> {
  const features = await queryLayer(
    "Shared/Permits",
    0,
    pointParams(lng, lat, {
      distance: "220",
      units: "esriSRUnit_Meter",
      outFields:
        "PERMIT_TYPE,PERMIT_NUMBER,PERMIT_LOCATION,STATUS,CALENDAR_YEAR_ISSUED,WORK_TYPE,WORK_DESCRIPTION,NUMBER_OF_UNITS,LINK",
      resultRecordCount: "8",
    }),
  );
  const permits = features.map((feature) => {
    const attrs = feature.attributes ?? {};
    const units = typeof attrs.NUMBER_OF_UNITS === "number" ? attrs.NUMBER_OF_UNITS : null;
    const link = typeof attrs.LINK === "string" && attrs.LINK.startsWith("http") ? attrs.LINK : null;
    return {
      year: attrs.CALENDAR_YEAR_ISSUED == null ? null : String(attrs.CALENDAR_YEAR_ISSUED),
      type: attrs.PERMIT_TYPE == null ? null : String(attrs.PERMIT_TYPE),
      status: attrs.STATUS == null ? null : String(attrs.STATUS),
      address: attrs.PERMIT_LOCATION == null ? null : String(attrs.PERMIT_LOCATION),
      units,
      number: attrs.PERMIT_NUMBER == null ? null : String(attrs.PERMIT_NUMBER),
      work: attrs.WORK_DESCRIPTION == null ? null : String(attrs.WORK_DESCRIPTION),
      link,
    } satisfies PermitHit;
  });
  return permits
    .sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))
    .slice(0, 4);
}

export async function readAnchor(seed: (typeof ANCHORS)[number]): Promise<AnchorFact | null> {
  const [zoningResult, fema, coaFlood, addressResult] = await Promise.all([
    readZoning(seed.lng, seed.lat).catch(() => null),
    layerCheck("Shared/Floodplain", 1, seed.lng, seed.lat),
    layerCheck("Shared/Floodplain", 0, seed.lng, seed.lat),
    nearestAddress(seed.lng, seed.lat).catch(() => null),
  ]);
  if (!zoningResult?.zoning) return null;
  return {
    id: seed.id,
    name: seed.name,
    lng: seed.lng,
    lat: seed.lat,
    address: addressResult,
    zoning: zoningResult.zoning,
    zoningBase: zoningResult.zoningBase,
    fema,
    coaFlood,
  };
}

let inflight: Promise<AnchorFact[]> | null = null;

export async function loadAnchorFacts(): Promise<AnchorFact[]> {
  if (!inflight) {
    inflight = readCachedOrLive().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function readCachedOrLive(): Promise<AnchorFact[]> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as { savedAt: number; facts: AnchorFact[] };
    if (Date.now() - parsed.savedAt < CACHE_TTL_MS && parsed.facts.length >= 5) return parsed.facts;
  } catch {
    // A missing cache just means we read the city layers.
  }
  const facts = (await mapPool(ANCHORS, 5, readAnchor)).filter((fact): fact is AnchorFact => fact !== null);
  if (facts.length < 3) {
    console.warn("[gis] city layers did not answer; using the bundled anchor reading");
    return (bundledAnchors as { facts: AnchorFact[] }).facts;
  }
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify({ savedAt: Date.now(), facts }));
  return facts;
}

export async function readField(fact: AnchorFact): Promise<FieldReport> {
  const [zoningResult, address, fema, coaFlood, nearFlood, permits, wui, pipeline, airport, creek, historic] =
    await Promise.all([
      readZoning(fact.lng, fact.lat).catch(() => null),
      nearestAddress(fact.lng, fact.lat).catch(() => null),
      layerCheck("Shared/Floodplain", 1, fact.lng, fact.lat),
      layerCheck("Shared/Floodplain", 0, fact.lng, fact.lat),
      layerCheck("Shared/Floodplain", 1, fact.lng, fact.lat, 30),
      readPermits(fact.lng, fact.lat).catch(() => []),
      layerCheck("Shared/Zoning_2", 31, fact.lng, fact.lat),
      layerCheck("Shared/Zoning_2", 16, fact.lng, fact.lat, 61),
      layerCheck("Shared/Zoning_2", 0, fact.lng, fact.lat),
      layerCheck("Shared/Environmental_1", 5, fact.lng, fact.lat, 30),
      layerCheck("Shared/Zoning_3", 1, fact.lng, fact.lat),
    ]);

  return {
    zoning: zoningResult?.zoning ?? fact.zoning,
    zoningBase: zoningResult?.zoningBase ?? fact.zoningBase,
    // An address search keeps the address the person typed, not the nearest city address point.
    address: fact.id.startsWith("addr-") ? fact.address : (address ?? fact.address),
    fema,
    coaFlood,
    nearFlood,
    permits,
    wui,
    pipeline,
    airport,
    creek,
    historic,
  };
}

export function placeLabel(address: string | null, name: string) {
  return address ?? name;
}
