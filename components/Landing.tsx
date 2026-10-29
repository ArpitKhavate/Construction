"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MapDesk = dynamic(() => import("@/components/MapDesk"), {
  ssr: false,
  loading: () => <div className="boot">Loading the map…</div>,
});

const SiteCanvas = dynamic(() => import("@/components/SiteScene"), {
  ssr: false,
  loading: () => <div className="boot">Raising the site…</div>,
});

const MENUS = [
  { label: "About us", body: "Austin site research before the lot is under contract." },
  { label: "Our work", body: "A live map, five city-data agents, and permit drafts you can download." },
  { label: "Newsroom", body: "The checklist follows the current Austin Development Services pages." },
  { label: "Sustainability", body: "Floodplain, creek, and pipeline reads stay attached to the spot." },
];

export default function Landing() {
  const params = useSearchParams();
  const jump = Boolean(params.get("prompt") || params.get("spot"));
  const rootRef = useRef<HTMLDivElement>(null);
  const [reduce, setReduce] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduce || jump) return;
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      const total = root.offsetHeight - window.innerHeight;
      const next = total <= 0 ? 1 : Math.min(1, Math.max(0, window.scrollY / total));
      setProgress(next);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduce, jump]);

  function enterMap() {
    const root = rootRef.current;
    if (!root) {
      document.getElementById("desk")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: root.offsetHeight, behavior: "smooth" });
  }

  if (jump) {
    return (
      <div className="flat-map">
        <MapDesk />
      </div>
    );
  }

  if (reduce) {
    return (
      <>
        <section className="hero-stage is-flat">
          <SiteCanvas progress={0} />
          <HeroChrome onEnter={enterMap} chrome={1} title={1} />
        </section>
        <div id="desk" className="flat-map">
          <MapDesk />
        </div>
      </>
    );
  }

  const heroOpacity = progress < 0.46 ? 1 : Math.max(0, 1 - (progress - 0.46) / 0.24);
  const chrome = progress < 0.08 ? 1 : Math.max(0, 1 - (progress - 0.08) / 0.16);
  const title = progress < 0.14 ? 1 : Math.max(0, 1 - (progress - 0.14) / 0.18);
  const rails = progress < 0.5 ? 1 : Math.max(0, 1 - (progress - 0.5) / 0.16);
  const mapOpacity = progress < 0.4 ? 0 : Math.min(1, (progress - 0.4) / 0.26);
  const revealed = progress >= 0.72;
  const panel = progress < 0.56 ? 0 : Math.min(1, (progress - 0.56) / 0.16);
  const titleScale = 1 + Math.min(progress, 0.28) * 1.4;

  return (
    <div className="story-root" ref={rootRef}>
      <div className="story-sticky">
        <div className="map-layer" style={{ opacity: mapOpacity }}>
          <MapDesk story={{ blur: 0, dim: 1, revealed, progress, panel }} />
        </div>
        <div
          className="hero-stage"
          style={{
            opacity: heroOpacity,
            visibility: heroOpacity < 0.04 ? "hidden" : "visible",
            pointerEvents: heroOpacity > 0.2 ? "auto" : "none",
          }}
          aria-hidden={heroOpacity < 0.05}
        >
          <SiteCanvas progress={progress} />
          <HeroChrome onEnter={enterMap} chrome={chrome} title={title} titleScale={titleScale} rails={rails} />
        </div>
      </div>
    </div>
  );
}

function HeroChrome({
  onEnter,
  chrome,
  title,
  titleScale = 1,
  rails = 1,
}: {
  onEnter: () => void;
  chrome: number;
  title: number;
  titleScale?: number;
  rails?: number;
}) {
  return (
    <>
      <header className="hero-nav" style={{ opacity: chrome }}>
        <a className="hero-logo" href="/" aria-label="Construction">
          <HardHat />
        </a>
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
      <div className="hero-copy" style={{ opacity: title, transform: `scale(${titleScale})` }}>
        <h1>
          Building your
          <br />
          vision into
          <br />
          reality.
        </h1>
        <button type="button" className="hero-learn" onClick={onEnter}>
          Learn more
        </button>
      </div>
      <p className="scroll-rail left" style={{ opacity: rails }}>
        Scroll down
      </p>
      <p className="scroll-rail right" style={{ opacity: rails }}>
        Scroll down
      </p>
    </>
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
