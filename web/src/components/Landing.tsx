"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LotSceneClient from "./LotSceneClient";
import SubmitButton from "@/app/start/SubmitButton";
import { findReport } from "@/app/actions";
import type { SceneView } from "./StreetScene";

// Scrolling down (wheel, swipe, keys) or pressing Begin building flies the camera from street
// level to a top-down map, then the search form appears over it. Scrolling up flies back.
export default function Landing() {
  const [view, setView] = useState<SceneView>("street");
  const addressRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 8) setView("map");
      else if (e.deltaY < -8) setView("street");
    };
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null) return;
      const dy = touchY - e.touches[0].clientY;
      if (dy > 40) setView("map");
      else if (dy < -40) setView("street");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (["ArrowDown", "PageDown", " "].includes(e.key)) setView("map");
      if (["ArrowUp", "PageUp"].includes(e.key)) setView("street");
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
  }, []);

  // Focus the address once the camera has landed.
  useEffect(() => {
    if (view !== "map") return;
    const id = setTimeout(() => addressRef.current?.focus({ preventScroll: true }), 2100);
    return () => clearTimeout(id);
  }, [view]);

  const onMap = view === "map";

  return (
    <main className="sky relative h-dvh overflow-hidden">
      <div className="absolute inset-0">
        <LotSceneClient view={view} />
      </div>

      {/* Sky-colored fade behind the hero copy so it stays readable over the rooftops. */}
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 w-full bg-[radial-gradient(60%_55%_at_0%_25%,rgb(203_232_245/0.92)_0%,rgb(203_232_245/0.75)_45%,rgb(203_232_245/0)_100%)] transition-opacity duration-500 md:w-[62%] ${onMap ? "opacity-0" : "opacity-100"}`}
      />

      <header className="relative z-20 flex items-start justify-between px-6 pt-6 md:px-10 md:pt-8">
        <button
          type="button"
          onClick={() => setView("street")}
          className="display text-xl font-bold uppercase tracking-wide"
        >
          Construction
        </button>
        <span className="pt-1 text-sm font-medium text-graphite-soft">Austin, Texas</span>
      </header>

      {/* Hero: street view */}
      <section
        aria-hidden={onMap}
        className={`relative z-10 px-6 pt-8 transition-all duration-500 md:px-10 md:pt-12 ${onMap ? "pointer-events-none -translate-y-6 opacity-0" : "opacity-100"}`}
      >
        <h1 className="display max-w-[14ch] text-[clamp(2.6rem,6.4vw,5.25rem)] leading-[0.92] font-extrabold text-balance">
          What can you build on your lot?
        </h1>
        <p className="mt-4 max-w-md text-lg leading-snug text-graphite md:text-xl">
          Enter an Austin address. See the zoning, permits and hazards, each with its source, a rough
          cost, and who to call next.
        </p>
        <button
          type="button"
          onClick={() => setView("map")}
          tabIndex={onMap ? -1 : 0}
          className="btn-red mt-6 inline-flex items-center gap-3 rounded-lg px-7 py-4 text-lg font-semibold"
        >
          Begin building
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 9h11M10 4l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>

      {/* Scroll hint */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-1 text-sm font-medium text-graphite transition-opacity duration-300 ${onMap ? "opacity-0" : "opacity-90"}`}
      >
        Scroll to find your lot
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M4 7l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Search: appears once the camera has landed over the map */}
      <section
        aria-hidden={!onMap}
        className={`absolute inset-0 z-10 flex items-end justify-center px-5 pb-6 transition-all md:items-center md:justify-start md:px-10 md:pb-0 duration-500 ${onMap ? "translate-y-0 opacity-100 delay-[1600ms]" : "pointer-events-none translate-y-4 opacity-0"}`}
      >
        <div className="w-full max-w-lg rounded-2xl bg-white/90 p-6 shadow-[0_2px_4px_rgb(52_52_47/0.08),0_24px_60px_-20px_rgb(52_52_47/0.45)] backdrop-blur-md md:p-8">
          <h2 className="display text-[clamp(2rem,4vw,2.75rem)] leading-[0.95] font-extrabold">Find your lot</h2>
          <p className="mt-2 text-graphite-soft">Austin, Texas only for now.</p>
          <form action={findReport} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-graphite-soft">Address</span>
              <input
                ref={addressRef}
                name="address"
                required
                tabIndex={onMap ? 0 : -1}
                defaultValue="3105 Cherrywood Rd, Austin, TX 78722"
                className="mt-1 w-full rounded-lg border border-graphite/20 bg-white px-4 py-3 text-lg font-medium outline-none focus-visible:border-graphite focus-visible:ring-2 focus-visible:ring-graphite/20"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-graphite-soft">What do you want to build?</span>
              <input
                name="idea"
                tabIndex={onMap ? 0 : -1}
                defaultValue="A backyard ADU (small second home) to rent out"
                className="mt-1 w-full rounded-lg border border-graphite/20 bg-white px-4 py-3 text-lg font-medium outline-none focus-visible:border-graphite focus-visible:ring-2 focus-visible:ring-graphite/20"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Link href="/start" tabIndex={onMap ? 0 : -1} className="text-sm font-medium text-graphite-soft underline-offset-4 hover:underline">
                Lots we&apos;ve already analyzed
              </Link>
              <SubmitButton />
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
