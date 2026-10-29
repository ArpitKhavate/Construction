"use client";

import { CrewOverlay } from "@/components/Crew";
import { CITIES } from "@/lib/anchors";
import type { Constraints, Spot } from "@/lib/types";
import maplibregl, { type Map as MlMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const EXAMPLES = [
  "4 homes in Austin, avoid the floodplain",
  "A duplex near central Austin",
  "12 apartments in Austin",
];

// 3105 Cherrywood Rd. The landing flight ends over this lot, so the map starts here and pulls out to the city.
const LOT: [number, number] = [-97.7168, 30.2862];

const BAND = { strong: "Strong match", possible: "Possible", weak: "Weak match" };

export type MapStory = {
  blur: number;
  dim: number;
  revealed: boolean;
  progress: number;
  panel: number;
};

type RecommendResponse = {
  spots: Spot[];
  chips: string[];
  constraints: Constraints;
  error?: string;
};

export default function MapDesk({ story, onHome }: { story?: MapStory; onHome?: () => void }) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const padRef = useRef<number | null>(null);
  const flew = useRef(false);
  const settled = useRef(false);
  const spotMarkers = useRef<Marker[]>([]);
  const router = useRouter();
  const params = useSearchParams();
  const [prompt, setPrompt] = useState(params.get("prompt") ?? "");
  const [spots, setSpots] = useState<Spot[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(params.get("spot"));
  const [status, setStatus] = useState("Click Austin, or describe a building and search.");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [researching, setResearching] = useState(false);
  const [ready, setReady] = useState(false);
  const auto = useRef(false);
  const [mode, setMode] = useState<"idea" | "address">("idea");
  const [address, setAddress] = useState("3105 Cherrywood Rd, Austin, TX 78722");
  const [addressIdea, setAddressIdea] = useState("A backyard ADU (small second home) to rent out");
  const [mapStyle, setMapStyle] = useState<"map" | "satellite">("map");

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const satellite = mapStyle === "satellite";
    map.setLayoutProperty("voyager", "visibility", satellite ? "none" : "visible");
    map.setLayoutProperty("satellite", "visibility", satellite ? "visible" : "none");
    map.setLayoutProperty("labels", "visibility", satellite ? "none" : "visible");
  }, [mapStyle, ready]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = new maplibregl.Map({
      container: mapNode.current,
      center: story ? LOT : [-98.6, 39.5],
      zoom: story ? 17 : 3.5,
      minZoom: 2.5,
      maxZoom: 18,
      attributionControl: { compact: true },
      fadeDuration: 0,
      style: {
        version: 8,
        sources: {
          voyager: {
            type: "raster",
            // Esri Light Gray Canvas: a clean, keyless street basemap (CARTO's tiles now need an API key).
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            maxzoom: 16,
            attribution: "Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors",
          },
          satellite: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution:
              "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          },
          labels: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            maxzoom: 16,
          },
        },
        layers: [
          { id: "voyager", type: "raster", source: "voyager" },
          { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
          { id: "labels", type: "raster", source: "labels" },
        ],
      },
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.setPadding({ left: 460 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    for (const city of CITIES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = city.live ? "city-pin live" : "city-pin";
      button.textContent = city.name;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!city.live) {
          setNotice(`${city.name} is on the map. Live lot research in this demo is Austin.`);
          map.flyTo({ center: [city.lng, city.lat], zoom: 5.5, duration: reduce ? 0 : 900 });
          return;
        }
        setNotice("");
        map.flyTo({ center: [-97.743, 30.29], zoom: 10.9, duration: reduce ? 0 : 1400 });
        setStatus("Austin is open. Describe the building to rank candidate spots.");
      });
      const marker = new maplibregl.Marker({ element: button, anchor: "center" })
        .setLngLat([city.lng, city.lat])
        .addTo(map);
      button.setAttribute("aria-label", city.name);
      if (city.live) button.style.zIndex = "10";
    }

    // "load" waits for every tile in view, which can lag during the landing flight; the style is enough to draw on.
    map.once("style.load", () => setReady(true));
    map.on("load", () => setReady(true));
    return () => {
      spotMarkers.current.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    // Markers and camera moves work before the style "load" event, so spots never wait on it.
    if (!map) return;
    spotMarkers.current.forEach((marker) => marker.remove());
    spotMarkers.current = spots.map((spot, index) => {
      const on = spot.id === selected;
      const address = spot.address ?? spot.name;
      const button = document.createElement("button");
      button.type = "button";
      button.className = on ? "pin on" : "pin";
      button.setAttribute("aria-label", `Spot ${index + 1}: ${address}`);
      const num = document.createElement("span");
      num.className = "pin-num";
      num.textContent = String(index + 1);
      button.append(num);
      if (on) {
        const label = document.createElement("span");
        label.className = "pin-label";
        label.textContent = address;
        button.append(label);
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelected(spot.id);
      });
      const marker = new maplibregl.Marker({ element: button, anchor: "bottom" })
        .setLngLat([spot.lng, spot.lat])
        .addTo(map);
      marker.getElement().style.zIndex = on ? "4" : "2";
      return marker;
    });
  }, [spots, selected]);

  const spotKey = spots.map((spot) => spot.id).join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spots.length) return;
    const bounds = new maplibregl.LngLatBounds();
    spots.forEach((spot) => bounds.extend([spot.lng, spot.lat]));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds(bounds, {
      // The map already pads the left by the panel width (setPadding), so only a small extra margin here.
      padding: { top: 120, bottom: 90, left: 40, right: 90 },
      maxZoom: 13,
      duration: reduce ? 0 : 800,
    });
  }, [spotKey]);

  // Picking a spot from the list eases the map to it. A new search fits all spots instead,
  // and the landing flight keeps the camera until the map is revealed.
  const easedKey = useRef(spotKey);
  useEffect(() => {
    const map = mapRef.current;
    if (easedKey.current !== spotKey) {
      easedKey.current = spotKey;
      return;
    }
    if (!map || (story && !story.revealed)) return;
    const spot = spots.find((item) => item.id === selected);
    if (!spot) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({ center: [spot.lng, spot.lat], zoom: Math.max(map.getZoom(), 12.5), duration: reduce ? 0 : 600 });
    // Only a new selection should move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, spotKey]);

  useEffect(() => {
    if (!ready || auto.current) return;
    const fromUrl = params.get("prompt");
    if (!fromUrl) return;
    auto.current = true;
    void search(fromUrl, params.get("spot"));
    // The URL prompt should run once after the map is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const live = story ? story.revealed : true;
  const pad = Math.round(460 * (story ? story.panel : 1));
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const handlers = [map.scrollZoom, map.boxZoom, map.doubleClickZoom, map.keyboard, map.dragPan];
    for (const handler of handlers) {
      if (live) handler.enable();
      else handler.disable();
    }
    if (live) {
      map.touchZoomRotate.enable();
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    } else {
      map.touchZoomRotate.disable();
    }
    if (padRef.current !== pad) {
      padRef.current = pad;
      map.setPadding({ left: pad });
    }
    if (live && !settled.current) {
      settled.current = true;
      map.resize();
    }
  }, [ready, live, pad]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !story || flew.current) return;
    if (story.progress < 0.42 && !story.revealed) return;
    flew.current = true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo({
      center: [-97.743, 30.29],
      zoom: 11.5,
      duration: reduceMotion || story.revealed ? 0 : 1700,
    });
  }, [ready, story]);

  async function search(text: string, preferId?: string | null) {
    const idea = text.trim();
    if (idea.length < 3) {
      setError("Describe the building you want.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setStatus("Reading Austin zoning and floodplain at candidate points…");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current?.flyTo({ center: [-97.743, 30.29], zoom: 10.9, duration: reduce ? 0 : 1200 });
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: idea }),
      });
      const data = (await response.json()) as RecommendResponse;
      if (!response.ok) throw new Error(data.error || "The map search failed.");
      setSpots(data.spots);
      setChips(data.chips);
      const match = data.spots.find((spot) => spot.id === preferId) ?? data.spots[0];
      setSelected(match?.id ?? null);
      setStatus(
        data.spots.length
          ? `${data.spots.length} candidate spots. Pick one, then run the agents.`
          : "No candidate spots came back.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The map search failed.");
      setStatus("The city layers did not finish.");
    } finally {
      setBusy(false);
    }
  }

  async function researchAddress() {
    if (address.trim().length < 5 || addressIdea.trim().length < 3) {
      setError("Add the address and what you want to build.");
      return;
    }
    setResearching(true);
    setError("");
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: addressIdea, address }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "Research could not start.");
      router.push(`/runs/${data.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Research could not start.");
      setResearching(false);
    }
  }

  async function research() {
    if (!selected) return;
    setResearching(true);
    setError("");
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, spotId: selected }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "Research could not start.");
      router.push(`/runs/${data.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Research could not start.");
      setResearching(false);
    }
  }

  return (
    <main className="map-screen">
      <div
        className="map-frame"
        style={
          story && story.blur > 0.05
            ? {
                filter: `blur(${story.blur}px) brightness(${story.dim})`,
                transform: story.blur > 0.4 ? "scale(1.08)" : undefined,
              }
            : undefined
        }
      >
        <div ref={mapNode} className="map" />
        <div className="map-style-toggle" role="group" aria-label="Map style">
          {(["map", "satellite"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={mapStyle === value ? "on" : undefined}
              aria-pressed={mapStyle === value}
              onClick={() => setMapStyle(value)}
            >
              {value === "map" ? "Map" : "Satellite"}
            </button>
          ))}
        </div>
      </div>
      {researching ? (
        <CrewOverlay
          place={
            mode === "address"
              ? address.split(",")[0]
              : (spots.find((spot) => spot.id === selected)?.address ?? "this spot")
          }
        />
      ) : null}
      <aside
        className="panel"
        style={story ? { opacity: story.panel, pointerEvents: story.revealed ? "auto" : "none" } : undefined}
        inert={story && !story.revealed ? true : undefined}
      >
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            if (!onHome) return;
            event.preventDefault();
            onHome();
          }}
        >
          <span className="brand-mark">B</span>
          <span>
            <strong>BuildWright</strong>
            <small>Austin site research</small>
          </span>
        </a>
        <div className="tabs" role="tablist" aria-label="How to search">
          <button type="button" role="tab" aria-selected={mode === "idea"} className={mode === "idea" ? "tab on" : "tab"} onClick={() => setMode("idea")}>
            Describe it
          </button>
          <button type="button" role="tab" aria-selected={mode === "address"} className={mode === "address" ? "tab on" : "tab"} onClick={() => setMode("address")}>
            I have an address
          </button>
        </div>
        {mode === "address" ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void researchAddress();
            }}
          >
            <div>
              <label htmlFor="address">Address</label>
              <input id="address" type="text" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="3105 Cherrywood Rd, Austin, TX" />
            </div>
            <div>
              <label htmlFor="address-idea">What do you want to build?</label>
              <textarea id="address-idea" value={addressIdea} onChange={(event) => setAddressIdea(event.target.value)} />
            </div>
            <button className="btn full" type="submit" disabled={researching}>
              {researching ? "Running the five agents…" : "Research this address"}
            </button>
            {error ? <p className="error">{error}</p> : null}
            <p className="fine">
              We match the address to its county parcel, then read zoning, flood, permits and the Austin process at that lot.
            </p>
          </form>
        ) : (
        <>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void search(prompt);
          }}
        >
          <label htmlFor="idea">What do you want to build?</label>
          <textarea
            id="idea"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="4 homes in Austin, avoid the floodplain"
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Reading city maps…" : "Find spots in Austin"}
          </button>
        </form>
        <div className="examples">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setPrompt(example);
                void search(example);
              }}
            >
              {example}
            </button>
          ))}
        </div>
        <p className="status" role="status">{notice || status}</p>
        {error ? <p className="error">{error}</p> : null}
        {chips.length ? (
          <div className="chips">
            {chips.map((chip) => (
              <span className="chip" key={chip}>{chip}</span>
            ))}
          </div>
        ) : null}
        <ol className="spot-list">
          {spots.map((spot, index) => (
            <li key={spot.id}>
              <button
                type="button"
                className={spot.id === selected ? "spot on" : "spot"}
                title={spot.caution ?? spot.reasons[0]}
                onClick={() => setSelected(spot.id)}
              >
                <span className="spot-num">{index + 1}</span>
                <span className="spot-main">
                  <b className="spot-addr">{spot.address ?? spot.name}</b>
                  <span className="spot-tags">
                    <span className="tag-zone">{spot.zoning ?? "Zoning missing"}</span>
                    <span className={`tag-band band ${spot.band}`}>{BAND[spot.band]}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="stack">
          <button className="btn full" type="button" disabled={!selected || researching} onClick={() => void research()}>
            {researching ? "Running the five agents…" : "Research this spot"}
          </button>
          <p className="fine">
            Numbered pins are city-map points with a zoning and flood read. Nearest addresses come from the city
            address layer. Sale prices are not part of this pass.
          </p>
        </div>
        </>
        )}
      </aside>
    </main>
  );
}
