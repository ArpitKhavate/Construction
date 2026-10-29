export type AnchorSeed = { id: string; name: string; lng: number; lat: number };

export const ANCHORS: AnchorSeed[] = [
  { id: "east-8th", name: "East 8th", lng: -97.7205, lat: 30.2628 },
  { id: "south-congress", name: "South Congress", lng: -97.7495, lat: 30.249 },
  { id: "mueller", name: "Mueller", lng: -97.7045, lat: 30.2975 },
  { id: "riverside", name: "East Riverside", lng: -97.7228, lat: 30.2405 },
  { id: "crestview", name: "Crestview", lng: -97.7198, lat: 30.3385 },
  { id: "st-johns", name: "St. Johns", lng: -97.71, lat: 30.332 },
  { id: "cherrywood", name: "Cherrywood", lng: -97.719, lat: 30.2865 },
  { id: "govalle", name: "Govalle", lng: -97.7015, lat: 30.2595 },
  { id: "montopolis", name: "Montopolis", lng: -97.698, lat: 30.232 },
  { id: "north-loop", name: "North Loop", lng: -97.7225, lat: 30.3185 },
  { id: "mlk", name: "MLK", lng: -97.708, lat: 30.281 },
  { id: "rundberg", name: "Rundberg", lng: -97.711, lat: 30.3555 },
  { id: "dove-springs", name: "Dove Springs", lng: -97.748, lat: 30.182 },
  { id: "hyde-park", name: "Hyde Park", lng: -97.7275, lat: 30.309 },
  { id: "bouldin", name: "Bouldin", lng: -97.7565, lat: 30.2515 },
  { id: "windsor", name: "Windsor", lng: -97.748, lat: 30.308 },
];

export const CITIES: { name: string; lng: number; lat: number; live: boolean }[] = [
  { name: "Austin", lng: -97.7431, lat: 30.2672, live: true },
  { name: "Dallas", lng: -96.797, lat: 32.7767, live: false },
  { name: "Houston", lng: -95.3698, lat: 29.7604, live: false },
  { name: "San Antonio", lng: -98.4936, lat: 29.4241, live: false },
  { name: "Denver", lng: -104.9903, lat: 39.7392, live: false },
  { name: "Chicago", lng: -87.6298, lat: 41.8781, live: false },
  { name: "New York", lng: -74.006, lat: 40.7128, live: false },
  { name: "Los Angeles", lng: -118.2437, lat: 34.0522, live: false },
  { name: "Seattle", lng: -122.3321, lat: 47.6062, live: false },
  { name: "Miami", lng: -80.1918, lat: 25.7617, live: false },
];

export const AUSTIN = { lng: -97.7431, lat: 30.29, zoom: 10.9 };
