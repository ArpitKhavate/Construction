import { readAnchor } from "@/lib/gis";
import type { AnchorFact } from "@/lib/types";

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const ESRI = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
const TCAD =
  "https://services.arcgis.com/0L95CJ0VTaxqcmED/ArcGIS/rest/services/EXTERNAL_tcad_parcel/FeatureServer/0/query";

type Point = { lng: number; lat: number; matched: string };

// Census is the primary geocoder. It misses some valid Austin addresses (and most typos),
// so Esri's World Geocoder is the fallback.
async function geocodeCensus(address: string): Promise<Point | null> {
  const url = new URL(CENSUS);
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] };
  };
  const match = data.result?.addressMatches?.[0];
  if (!match) return null;
  return { lng: match.coordinates.x, lat: match.coordinates.y, matched: match.matchedAddress };
}

async function geocodeEsri(address: string): Promise<Point | null> {
  const url = new URL(ESRI);
  url.searchParams.set("SingleLine", address);
  url.searchParams.set("countryCode", "USA");
  url.searchParams.set("maxLocations", "1");
  url.searchParams.set("outFields", "Addr_type");
  url.searchParams.set("f", "json");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    candidates?: { address: string; score: number; location: { x: number; y: number }; attributes?: { Addr_type?: string } }[];
  };
  const match = data.candidates?.[0];
  // Only street-level matches; a city or ZIP centroid would research the wrong lot.
  const precise = ["PointAddress", "StreetAddress", "Subaddress", "StreetAddressExt"];
  if (!match || match.score < 80 || !precise.includes(match.attributes?.Addr_type ?? "")) return null;
  return { lng: match.location.x, lat: match.location.y, matched: match.address };
}

async function geocode(address: string): Promise<Point | null> {
  return (await geocodeCensus(address).catch(() => null)) ?? (await geocodeEsri(address).catch(() => null));
}

type Parcel = { propId: number; lng: number; lat: number };

// Geocoder points land on the street centerline, which misses the zoning polygon. Return nearby county
// parcels, the one whose situs number matches first, then the rest by distance, so the caller can read
// the city layers at a parcel centroid instead.
async function nearbyParcels(lng: number, lat: number, houseNumber: string): Promise<Parcel[]> {
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
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    features?: { attributes: { PROP_ID: number; SITUS: string | null }; centroid?: { x: number; y: number } }[];
  };
  const distance = (x: number, y: number) => Math.hypot((x - lng) * Math.cos((lat * Math.PI) / 180), y - lat);
  return (data.features ?? [])
    .filter((feature) => feature.centroid)
    .map((feature) => ({
      propId: feature.attributes.PROP_ID,
      lng: feature.centroid!.x,
      lat: feature.centroid!.y,
      exact: Boolean(houseNumber) && String(feature.attributes.SITUS ?? "").trim().startsWith(houseNumber),
      far: distance(feature.centroid!.x, feature.centroid!.y),
    }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.far - b.far)
    .map(({ propId, lng: x, lat: y }) => ({ propId, lng: x, lat: y }));
}

function titleCase(text: string) {
  return text.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function readAddress(address: string): Promise<AnchorFact> {
  const text = address.trim();
  if (text.length < 5) throw new Error("Add the street number and street name.");
  const query = /austin|tx|texas|\b7\d{4}\b/i.test(text) ? text : `${text}, Austin, TX`;
  const point = await geocode(query);
  if (!point) throw new Error("We could not find that address. Try the street number, street and ZIP.");
  const houseNumber = text.match(/^\d+/)?.[0] ?? "";
  const parcels = await nearbyParcels(point.lng, point.lat, houseNumber).catch(() => []);
  const street = titleCase(point.matched.split(",")[0]);

  // The matching parcel first, then the nearest few, then the raw point: the first one inside
  // the Austin zoning map wins.
  const tries = [...parcels.slice(0, 3), { propId: null, lng: point.lng, lat: point.lat }];
  for (const place of tries) {
    const fact = await readAnchor({
      id: `addr-${place.propId ?? `${place.lng.toFixed(5)},${place.lat.toFixed(5)}`}`,
      name: street,
      lng: place.lng,
      lat: place.lat,
    });
    if (fact) return { ...fact, address: street };
  }
  throw new Error("That address is outside the Austin zoning map. Live research covers Austin only.");
}
