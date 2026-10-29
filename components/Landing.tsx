"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MapDesk = dynamic(() => import("@/components/MapDesk"), {
  ssr: false,
  loading: () => <div className="boot">Loading the map…</div>,
});

const CARDS = [
  {
    kicker: "Before the lot",
    title: "Start with Austin, still out of focus.",
    body: "Scroll and the satellite sharpens. Other cities stay on the map. Live research is Austin.",
  },
  {
    kicker: "Five agents",
    title: "Zoning, flood, permits, site rules, and the creek.",
    body: "Each answer comes from a city layer or a published Development Services page, with the reason beside it.",
  },
  {
    kicker: "The application",
    title: "One click writes the permit drafts.",
    body: "After the checklist, the clerk fills the city forms from that research. You can read them and download the PDFs. Nothing is filed.",
  },
];

const SPANS = [
  { enter: 0, hold: 0.18, out: 0.26 },
  { enter: 0.3, hold: 0.46, out: 0.54 },
  { enter: 0.58, hold: 0.72, out: 0.78 },
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

  if (reduce || jump) {
    return (
      <>
        {reduce ? (
          <div className="flat-story">
            {CARDS.map((card) => (
              <section key={card.title} className="flat-card">
                <p className="kicker">{card.kicker}</p>
                <h1>{card.title}</h1>
                <p>{card.body}</p>
              </section>
            ))}
          </div>
        ) : null}
        <div className="flat-map">
          <MapDesk />
        </div>
      </>
    );
  }

  const eased = Math.min(1, progress / 0.88);
  const blur = 20 * (1 - eased);
  const dim = 0.72 + 0.28 * eased;
  const revealed = progress >= 0.9;
  const panel = progress < 0.82 ? 0 : Math.min(1, (progress - 0.82) / 0.1);
  const overlay = progress < 0.76 ? 1 : Math.max(0, 1 - (progress - 0.76) / 0.12);

  function skip() {
    const root = rootRef.current;
    if (!root) return;
    window.scrollTo({ top: root.offsetHeight, behavior: "smooth" });
  }

  return (
    <div className="story-root" ref={rootRef}>
      <div className="story-sticky">
        <MapDesk story={{ blur, dim, revealed, progress, panel }} />
        <div
          className="story-overlay"
          style={{
            opacity: overlay,
            visibility: overlay < 0.05 ? "hidden" : "visible",
            pointerEvents: overlay > 0.15 ? "auto" : "none",
          }}
          aria-hidden={overlay < 0.05}
        >
          {CARDS.map((card, index) => {
            const opacity = cardOpacity(progress, index);
            return (
              <article key={card.title} className="story-card" style={{ opacity }} aria-hidden={opacity < 0.4}>
                <p className="kicker">{card.kicker}</p>
                <h1>{card.title}</h1>
                <p>{card.body}</p>
              </article>
            );
          })}
          <button type="button" className="btn secondary story-skip" onClick={skip}>
            Skip to the questions
          </button>
        </div>
      </div>
    </div>
  );
}

function cardOpacity(progress: number, index: number) {
  const span = SPANS[index];
  if (index === 0 && progress <= span.hold) return 1;
  if (progress <= span.enter) return 0;
  if (progress < span.hold) return (progress - span.enter) / (span.hold - span.enter);
  if (progress >= span.out) return 0;
  if (progress <= span.hold) return 1;
  return 1 - (progress - span.hold) / (span.out - span.hold);
}
