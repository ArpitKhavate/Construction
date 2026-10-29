import saved from "@/lib/demo-cache.json";
import type { AnchorFact, FieldReport } from "@/lib/types";

// Saved city-layer readings for the demo addresses, so the demo still works if the city's map
// servers are slow or down. Refresh with scripts in the README; live data is always tried first.
type Entry = { fact: AnchorFact; field: FieldReport; savedAt: string };

const CACHE = saved as unknown as Record<string, Entry>;

// "3105 Cherrywood Rd, Austin" and "1500 S. Lamar Blvd" become "3105 cherrywood" and "1500 lamar".
export function demoKey(address: string) {
  const match = address
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .match(/^(\d+)\s+(?:(?:n|s|e|w|north|south|east|west)\s+)?([a-z0-9]+)/);
  return match ? `${match[1]} ${match[2]}` : null;
}

export function cachedDemo(address: string): Entry | null {
  const key = demoKey(address);
  return key ? (CACHE[key] ?? null) : null;
}

// A reading with most layers unanswered is worse than the saved one.
export function degraded(field: FieldReport) {
  const checks = [field.fema, field.coaFlood, field.nearFlood, field.wui, field.pipeline, field.airport, field.creek, field.historic];
  return !field.zoning || checks.filter((check) => check.state === "unknown").length >= 3;
}
