"use client";

import type { BuildView } from "@/components/BuildScene";
import type { Surroundings } from "@/lib/surroundings";
import type { DesignPhoto, RunRecord } from "@/lib/types";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const BuildScene = dynamic(() => import("@/components/BuildScene"), { ssr: false });

const STAGES = ["Site prep", "Foundation", "Framing", "Finished"];
const DEFAULT_EXTERIOR = ["#ebe5da", "#3d4248", "#ffffff", "#7a4b2a", "#a6aea0"];
const DEFAULT_INTERIOR = ["#f1ece4", "#b08155", "#4a4f55", "#7d8f6a", "#d8c8b0"];

export function SiteBuilder({ id }: { id: string }) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(0);
  const [view, setView] = useState<BuildView>("exterior");
  const [tab, setTab] = useState<DesignPhoto["kind"]>("exterior");
  const [exteriorId, setExteriorId] = useState<string | null>(null);
  const [interiorId, setInteriorId] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);
  const [split, setSplit] = useState(55);
  const [surroundings, setSurroundings] = useState<Surroundings | null>(null);
  const [neighborhood, setNeighborhood] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/runs/${id}`);
        const data = (await response.json()) as RunRecord & { error?: string };
        if (!response.ok) throw new Error(data.error || "Run not found.");
        let current = data;
        if (!current.render) {
          const rendered = await fetch(`/api/runs/${id}/render`, { method: "POST" });
          if (rendered.ok) current = (await rendered.json()) as RunRecord;
        }
        if (!cancelled) setRun(current);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Run not found.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    setNeighborhood("loading");
    fetch(`/api/runs/${id}/surroundings`)
      .then(async (response) => {
        const data = (await response.json()) as Surroundings & { error?: string };
        if (!response.ok) throw new Error(data.error || "No neighborhood data.");
        if (!cancelled) {
          setSurroundings(data);
          setNeighborhood("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setNeighborhood("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [id, Boolean(run)]);

  useEffect(() => {
    const timers = [1, 2, 3].map((next) => window.setTimeout(() => setStage((value) => Math.max(value, next)), 700 + next * 1100));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const photos = run?.design?.photos ?? [];
  const exteriors = photos.filter((photo) => photo.kind === "exterior");
  const interiors = photos.filter((photo) => photo.kind === "interior");
  const exterior = exteriors.find((photo) => photo.id === exteriorId) ?? exteriors[0] ?? null;
  const interior = interiors.find((photo) => photo.id === interiorId) ?? interiors[0] ?? null;
  const focus = tab === "exterior" ? exterior : interior;
  const list = tab === "exterior" ? exteriors : interiors;

  const metersAcross = useMemo(() => {
    if (!run) return 330;
    return (640 * 156543.03 * Math.cos((run.spot.lat * Math.PI) / 180)) / 2 ** 18;
  }, [run]);

  async function scrape(fresh = false) {
    setScraping(true);
    setError("");
    try {
      const response = await fetch(`/api/runs/${id}/design${fresh ? "?fresh=1" : ""}`, { method: "POST" });
      const data = (await response.json()) as RunRecord & { error?: string };
      if (!response.ok) throw new Error(data.error || "The design photos could not be scraped.");
      setRun(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The design photos could not be scraped.");
    } finally {
      setScraping(false);
    }
  }

  function pickView(next: BuildView) {
    setView(next);
    setTab(next);
    if (next === "interior") setStage(3);
  }

  if (!run) {
    return (
      <main className="sb">
        <div className="sb-loading">{error || "Loading the lot and its aerial…"}</div>
      </main>
    );
  }

  const units = run.constraints.units ?? 2;
  const place = run.spot.address ?? run.spot.name;

  return (
    <main className="sb">
      <div className="sb-stage">
        <BuildScene
          aerial={run.render ? `/api/media/${run.render.before}` : null}
          metersAcross={metersAcross}
          units={units}
          stage={stage}
          view={view}
          exterior={exterior?.palette ?? DEFAULT_EXTERIOR}
          interior={interior?.palette ?? DEFAULT_INTERIOR}
          surroundings={surroundings}
        />
        {neighborhood === "loading" ? <p className="sb-status">Building the street from OpenStreetMap… about 40 s the first time</p> : null}
        {neighborhood === "failed" ? <p className="sb-status">OpenStreetMap did not answer, so the lot sits on the aerial photo.</p> : null}
      </div>

      <header className="sb-head">
        <Link className="sb-back" href={`/runs/${id}`}>
          ← Back to the research
        </Link>
        <div>
          <p className="sb-kicker">Site builder</p>
          <h1>{place}</h1>
          <p className="sb-sub">
            {units} home{units === 1 ? "" : "s"} · {run.spot.zoning ?? "zoning not read"}
          </p>
        </div>
      </header>

      <div className="sb-dock">
        <div className="sb-seg" role="group" aria-label="Build stage">
          {STAGES.map((label, index) => (
            <button key={label} type="button" className={stage === index ? "on" : ""} onClick={() => setStage(index)}>
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>
        <div className="sb-seg small" role="group" aria-label="View">
          {(["exterior", "interior"] as const).map((option) => (
            <button key={option} type="button" className={view === option ? "on" : ""} onClick={() => pickView(option)}>
              {option === "exterior" ? "Exterior" : "Interior cutaway"}
            </button>
          ))}
        </div>
      </div>

      <aside className="sb-panel">
        <p className="sb-kicker">AutoHDR design pipeline</p>
        <h2>Styles from real Austin homes</h2>
        {!run.design ? (
          <>
            <p className="sb-muted">
              Apify scrapes Google Maps photos from custom home builders and interior designers near this lot. Our pipeline
              enhances each one and pulls its colors onto the build.
            </p>
            <button className="sb-btn" type="button" disabled={scraping} onClick={() => void scrape()}>
              {scraping ? "Apify is scraping photos… up to 2 min" : "Scrape design photos"}
            </button>
          </>
        ) : (
          <>
            <div className="sb-tabs" role="tablist">
              {(["exterior", "interior"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={tab === option}
                  className={tab === option ? "on" : ""}
                  onClick={() => pickView(option)}
                >
                  {option === "exterior" ? `Exterior (${exteriors.length})` : `Interior (${interiors.length})`}
                </button>
              ))}
            </div>

            {focus ? (
              <figure className="sb-compare">
                <img src={`/api/media/${focus.before}`} alt={`Original photo from ${focus.place}`} />
                <img
                  className="after"
                  src={`/api/media/${focus.after}`}
                  alt={`Enhanced photo from ${focus.place}`}
                  style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                />
                <span className="sb-tag left">Original</span>
                <span className="sb-tag right">Enhanced</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  aria-label="Compare original and enhanced photo"
                  onChange={(event) => setSplit(Number(event.target.value))}
                />
                <figcaption>
                  <span className="sb-swatches">
                    {focus.palette.map((swatch) => (
                      <i key={swatch} style={{ background: swatch }} title={swatch} />
                    ))}
                  </span>
                  {focus.sourceUrl ? (
                    <a href={focus.sourceUrl} target="_blank" rel="noreferrer">
                      {focus.place}
                    </a>
                  ) : (
                    focus.place
                  )}
                </figcaption>
              </figure>
            ) : (
              <p className="sb-muted">No {tab} photos in this scrape. The build uses a neutral palette.</p>
            )}

            <div className="sb-grid">
              {list.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className={photo.id === focus?.id ? "on" : ""}
                  onClick={() => (tab === "exterior" ? setExteriorId(photo.id) : setInteriorId(photo.id))}
                  aria-label={`Use the ${tab} style from ${photo.place}`}
                >
                  <img src={`/api/media/${photo.after}`} alt="" loading="lazy" />
                </button>
              ))}
            </div>

            <details className="sb-steps">
              <summary>
                What the pipeline did · {run.design.source === "cache" ? "cached scrape" : "live scrape"}
              </summary>
              <ol>
                {run.design.steps.map((item) => (
                  <li key={item.step}>
                    <strong>{item.step}.</strong> {item.note}
                  </li>
                ))}
              </ol>
              <button className="sb-link" type="button" disabled={scraping} onClick={() => void scrape(true)}>
                {scraping ? "Scraping…" : "Scrape again"}
              </button>
            </details>
          </>
        )}
        {error ? <p className="sb-error">{error}</p> : null}
        <p className="sb-fine">
          A 3D massing study, not an architect&apos;s design or a permit drawing. Home sizes are illustrative. Nearby
          buildings and streets come from OpenStreetMap footprints, trees from aerial canopy; their looks are
          approximated. Colors come from the photo you pick; the photos belong to the businesses linked.
        </p>
      </aside>
    </main>
  );
}
