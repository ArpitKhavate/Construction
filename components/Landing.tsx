"use client";

import type { SceneView } from "@/components/StreetScene";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const MapDesk = dynamic(() => import("@/components/MapDesk"), { ssr: false });
const StreetScene = dynamic(() => import("@/components/StreetScene"), { ssr: false });

// Scrolling down (wheel, swipe, keys) or pressing the hero button flies the street camera to a
// top-down view, then the satellite map fades in over it and pulls out from the lot to Austin.
// Timings line up with the 2s camera flight in StreetScene.
const FADE_AT = 1500;
const REVEAL_AT = 2400;

const MENUS = [
  { label: "About us", body: "Austin site research before the lot is under contract." },
  { label: "Our work", body: "A live map, five city-data agents, and permit drafts you can download." },
  { label: "Newsroom", body: "The checklist follows the current Austin Development Services pages." },
  { label: "Sustainability", body: "Floodplain, creek, and pipeline reads stay attached to the spot." },
];

// ?hero=b (default) Arpit's copy and nav, ?hero=a our copy, ?hero=c our copy with Arpit's nav.
type Hero = "a" | "b" | "c";

export default function Landing() {
  const params = useSearchParams();
  const jump = Boolean(params.get("prompt") || params.get("spot"));
  const raw = params.get("hero");
  const hero: Hero = raw === "a" || raw === "c" ? raw : "b";

  const [view, setView] = useState<SceneView>("street");
  const [mapShown, setMapShown] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (jump || view !== "street") return;
    const go = () => setView("map");
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 8) go();
    };
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (touchY !== null && touchY - e.touches[0].clientY > 40) go();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (["ArrowDown", "PageDown", " "].includes(e.key)) go();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [jump, view]);

  useEffect(() => {
    if (view !== "map") {
      setMapShown(false);
      setRevealed(false);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fade = window.setTimeout(() => setMapShown(true), reduce ? 0 : FADE_AT);
    const reveal = window.setTimeout(() => setRevealed(true), reduce ? 0 : REVEAL_AT);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(reveal);
    };
  }, [view]);

  if (jump) {
    return (
      <div className="flat-map">
        <MapDesk />
      </div>
    );
  }

  const onMap = view === "map";
  const enter = () => setView("map");

  return (
    <main className="land sky">
      <div className="land-layer">
        <StreetScene view={view} paused={revealed} />
      </div>

      <div className={`land-scrim${onMap ? " is-off" : ""}`} aria-hidden="true" />

      {hero === "a" ? (
        <header className={`land-head${onMap ? " is-off" : ""}`}>
          <span className="wordmark display">BuildWright</span>
          <span className="land-place">Austin, Texas</span>
        </header>
      ) : (
        <ArpitNav onEnter={enter} hidden={onMap} />
      )}

      <section className={`land-hero${onMap ? " is-off" : ""}`} aria-hidden={onMap}>
        {hero === "b" ? (
          <>
            <h1 className="land-title is-shout">
              Building your
              <br />
              vision into
              <br />
              reality.
            </h1>
            <p className="land-lede">
              Enter an Austin address. See the zoning, permits and hazards, each with its source, and who to call next.
            </p>
            <button type="button" className="btn-red land-cta" onClick={enter} tabIndex={onMap ? -1 : 0}>
              Find your lot
              <Arrow />
            </button>
          </>
        ) : (
          <>
            <h1 className="land-title display">What can you build on your lot?</h1>
            <p className="land-lede">
              Enter an Austin address. See the zoning, permits and hazards, each with its source, a rough cost, and who
              to call next.
            </p>
            <button type="button" className="btn-red land-cta" onClick={enter} tabIndex={onMap ? -1 : 0}>
              Begin building
              <Arrow />
            </button>
          </>
        )}
      </section>

      <div className={`land-hint${onMap ? " is-off" : ""}`} aria-hidden="true">
        Scroll to find your lot
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path d="M4 7l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div
        className={`land-map${mapShown ? " is-on" : ""}`}
        aria-hidden={!revealed}
        inert={!revealed ? true : undefined}
      >
        <MapDesk
          story={{ blur: 0, dim: 1, revealed, progress: mapShown ? 1 : 0, panel: revealed ? 1 : 0 }}
          onHome={() => setView("street")}
        />
      </div>
    </main>
  );
}

function ArpitNav({ onEnter, hidden }: { onEnter: () => void; hidden: boolean }) {
  return (
    <header className={`land-head hero-nav-light${hidden ? " is-off" : ""}`}>
      <span className="hero-logo" aria-label="BuildWright">
        <HardHat />
      </span>
      <nav className="hero-links" aria-label="Primary">
        {MENUS.map((item) => (
          <details key={item.label} className="hero-menu">
            <summary>{item.label}</summary>
            <p>{item.body}</p>
          </details>
        ))}
        <button type="button" className="hero-search" aria-label="Search the map" onClick={onEnter}>
          <SearchIcon />
        </button>
      </nav>
    </header>
  );
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 9h11M10 4l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HardHat() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 30h32v4.5c0 2.5-2 4.5-4.5 4.5h-23C10 39 8 37 8 34.5V30zm4.2-2.2C13 20.2 17.6 14 24 14s11 6.2 11.8 13.8H12.2zM22 8h4v6h-4V8z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M15.2 15.2 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
