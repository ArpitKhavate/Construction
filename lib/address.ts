import { readAnchor } from "@/lib/gis";
import type { AnchorFact } from "@/lib/types";

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const TCAD =
  "https://services.arcgis.com/0L95CJ0VTaxqcmED/ArcGIS/rest/services/EXTERNAL_tcad_parcel/FeatureServer/0/query";

// Census points land on the street centerline, which misses the zoning polygon. Snap to the
// county parcel whose situs number matches, and read the city layers at its centroid.
async function geocode(address: string) {
  const url = new URL(CENSUS);
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`The address lookup returned ${response.status}.`);
  const data = (await response.json()) as {
    result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] };
  };
  const match = data.result?.addressMatches?.[0];
  if (!match) return null;
  return { lng: match.coordinates.x, lat: match.coordinates.y, matched: match.matchedAddress };
}

async function snapToParcel(lng: number, lat: number, houseNumber: string) {
  const url = new URL(TCAD);
  const params = {
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: "60",
    units: "esriSRUnit_Meter",
    outFields: "PROP_ID,SITUS",
    returnGeometry: "false",
    returnCentroid: "true",
    f: "json",
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    features?: { attributes: { PROP_ID: number; SITUS: string | null }; centroid?: { x: number; y: number } }[];
  };
  const hit = data.features?.find((feature) => String(feature.attributes.SITUS ?? "").trim().startsWith(houseNumber));
  if (!hit?.centroid) return null;
  return { propId: hit.attributes.PROP_ID, lng: hit.centroid.x, lat: hit.centroid.y };
}

function titleCase(text: string) {
  return text.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function readAddress(address: string): Promise<AnchorFact> {
  const text = address.trim();
  const query = /austin|tx|texas|\b7\d{4}\b/i.test(text) ? text : `${text}, Austin, TX`;
  const point = await geocode(query);
  if (!point) throw new Error("We could not find that address. Try the street number, street and ZIP.");
  const houseNumber = text.match(/^\d+/)?.[0] ?? "";
  const parcel = houseNumber ? await snapToParcel(point.lng, point.lat, houseNumber).catch(() => null) : null;
  const lng = parcel?.lng ?? point.lng;
  const lat = parcel?.lat ?? point.lat;
  const street = titleCase(point.matched.split(",")[0]);
  const fact = await readAnchor({
    id: `addr-${parcel?.propId ?? `${lng.toFixed(5)},${lat.toFixed(5)}`}`,
    name: street,
    lng,
    lat,
  });
  if (!fact) throw new Error("That address is outside the Austin zoning map. Live research covers Austin only.");
  return { ...fact, address: street };
}
