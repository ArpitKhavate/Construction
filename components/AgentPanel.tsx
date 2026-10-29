"use client";

import { useState, type CSSProperties, type ReactElement } from "react";
import type { AgentId, AgentStep, LayerCheck, PermitHit, RunRecord } from "@/lib/types";

// The wide panel under the crew row. It replays what the selected agent actually looked up,
// one row per real lookup, then shows that agent's summary, details and sources.
// All motion is CSS (app/agent-panel.css); this file only decides rows, state and timing.

export const AGENT_MS = 2500;

const ORDER: AgentId[] = ["codes", "hazards", "permits", "development", "environmental"];

type Agent = { name: string; role: string; art: string; color: string };

const AGENTS: Record<AgentId, Agent> = {
  codes: { name: "Zoney", role: "Zoning and codes", art: "/crew/zoney.png", color: "#f2c230" },
  hazards: { name: "Levee", role: "Flood and hazards", art: "/crew/levee.png", color: "#3c8fd9" },
  permits: { name: "Stamp", role: "Permit history", art: "/crew/stamp.png", color: "#e0582a" },
  development: { name: "Foreman", role: "Filing path", art: "/crew/foreman.png", color: "#1f9e8f" },
  environmental: { name: "Fern", role: "Creeks and trees", art: "/crew/fern.png", color: "#5aa845" },
};

type PanelState = "queued" | "working" | "done" | "gap";
type Mark = "ok" | "hit" | "none";
type IconName =
  | "map"
  | "zone"
  | "columns"
  | "water"
  | "flame"
  | "plane"
  | "pipe"
  | "doc"
  | "leaf"
  | "route"
  | "building";
type Row = { icon: IconName; label: string; result: string; mark: Mark };

// Time between the spinner appearing on a row and its final mark popping in.
const RESOLVE_MS = 450;

function clip(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function layerRow(icon: IconName, label: string, layer: LayerCheck): Row {
  if (layer.state === "hit") {
    return { icon, label, result: `Hit${layer.label ? ` (${layer.label})` : ""}`, mark: "hit" };
  }
  if (layer.state === "clear") return { icon, label, result: "Clear", mark: "ok" };
  return { icon, label, result: "No answer", mark: "none" };
}

function valueRow(icon: IconName, label: string, value: string | null): Row {
  return value ? { icon, label, result: value, mark: "ok" } : { icon, label, result: "No answer", mark: "none" };
}

function permitRow(p: PermitHit): Row {
  const parts = [p.year, p.work || p.type, p.status].filter((x): x is string => Boolean(x && x.trim()));
  return {
    icon: "doc",
    label: p.address || "Permit",
    result: parts.length ? clip(parts.join(" · ")) : "No details on file",
    mark: "ok",
  };
}

function requestLabel(run: RunRecord): string {
  const c = run.constraints;
  if (c.kind === "commercial") return "Commercial building";
  if (c.adu) return "Backyard ADU";
  if (c.fourplex) return "Fourplex";
  if (c.units) return c.units === 1 ? "1 home" : `${c.units} homes`;
  return "Housing";
}

function buildRows(run: RunRecord, id: AgentId): Row[] {
  const f = run.field;
  switch (id) {
    case "codes": {
      const h = f.historic;
      const historic: Row =
        h.state === "hit"
          ? { icon: "columns", label: "Historic district", result: `Inside ${h.label ?? "a historic district"}`, mark: "hit" }
          : h.state === "clear"
            ? { icon: "columns", label: "Historic district", result: "Not in one", mark: "ok" }
            : { icon: "columns", label: "Historic district", result: "No answer", mark: "none" };
      return [valueRow("map", "Austin zoning map", f.zoning), valueRow("zone", "Base district", f.zoningBase), historic];
    }
    case "hazards":
      return [
        layerRow("water", "FEMA flood zone", f.fema),
        layerRow("water", "City floodplain", f.coaFlood),
        layerRow("water", "FEMA flood within 100 ft", f.nearFlood),
        layerRow("pipe", "Hazardous pipeline within 200 ft", f.pipeline),
        layerRow("flame", "Wildfire interface", f.wui),
        layerRow("plane", "Airport overlay", f.airport),
      ];
    case "permits": {
      const n = f.permits.length;
      return [
        { icon: "doc", label: "Building permits within 220 m", result: n ? `${n} found` : "None found", mark: "ok" },
        ...f.permits.slice(0, 3).map(permitRow),
      ];
    }
    case "development": {
      const states = [f.fema.state, f.coaFlood.state];
      const flood: Row = states.includes("hit")
        ? { icon: "water", label: "Floodplain", result: "In a flood zone", mark: "hit" }
        : states.every((s) => s === "clear")
          ? { icon: "water", label: "Floodplain", result: "Clear", mark: "ok" }
          : { icon: "water", label: "Floodplain", result: "No answer", mark: "none" };
      const c = run.constraints;
      const path =
        c.kind === "commercial" ? "Commercial review" : (c.units ?? 0) > 4 ? "Site plan first" : "Residential Plan Review";
      return [
        { icon: "building", label: "Your request", result: requestLabel(run), mark: "ok" },
        valueRow("map", "Zoning", f.zoning),
        flood,
        { icon: "route", label: "Filing path", result: path, mark: "ok" },
      ];
    }
    case "environmental":
      return [
        layerRow("leaf", "Creek within 100 ft", f.creek),
        layerRow("water", "FEMA flood zone", f.fema),
        layerRow("water", "City floodplain", f.coaFlood),
        { icon: "leaf", label: "Protected trees", result: "Not checked in this pass", mark: "none" },
        { icon: "water", label: "Water quality zones", result: "Not checked in this pass", mark: "none" },
      ];
  }
}

const PATHS: Record<IconName, ReactElement> = {
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  zone: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 12h16M12 4v16" />
    </>
  ),
  columns: (
    <>
      <path d="M3 9 12 4l9 5" />
      <path d="M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20h18" />
    </>
  ),
  water: (
    <>
      <path d="M12 3.5c3 3.6 5.5 6.6 5.5 9.6a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-9.6Z" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3c.5 3.2 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2.2 1.2-3.4 2.2-4.4.3 1.6 1 2.4 1.8 2.6C11 8.6 11 5.6 12 3Z" />
    </>
  ),
  plane: (
    <>
      <path d="M21 15.5 13.5 11V5a1.5 1.5 0 0 0-3 0v6L3 15.5V17l7.5-2.2V19L8.5 20.5V22l3.5-1 3.5 1v-1.5l-2-1.5v-4.2L21 17Z" />
    </>
  ),
  pipe: (
    <>
      <path d="M3 8h9a5 5 0 0 1 5 5v8" />
      <path d="M3 14h5a3 3 0 0 1 3 3v4" />
      <path d="M3 6v10M9 21h10" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 15-14-1 10-6 15-13 15" />
      <path d="M5 19 13 11" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V9l8-5 8 5v12" />
      <path d="M9 21v-6h6v6M3 21h18" />
    </>
  ),
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === "ok") {
    return (
      <span className="ap-mark ap-mark-ok" aria-label="Checked">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 12.5 4 4 8-9" />
        </svg>
      </span>
    );
  }
  if (mark === "hit") {
    return (
      <span className="ap-mark ap-mark-hit" aria-label="Finding">
        !
      </span>
    );
  }
  return (
    <span className="ap-mark ap-mark-none" aria-label="Not checked">
      <span className="ap-dash" />
    </span>
  );
}

function Summary({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ap-summary-block">
      <p className="ap-summary">{step.summary}</p>
      {step.bullets.length > 0 && (
        <>
          <button type="button" className="ap-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide details" : "Show details"}
          </button>
          {open && (
            <ul className="ap-bullets">
              {step.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {step.sources.length > 0 && (
        <div className="ap-sources">
          {step.sources.map((s) => (
            <a key={s.url + s.label} className="ap-chip" href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const PILL: Record<PanelState, string> = {
  queued: "Waiting",
  working: "Working…",
  done: "Done",
  gap: "Some layers did not answer",
};

export function AgentPanel({ run, shown, selected }: { run: RunRecord; shown: number; selected: AgentId }) {
  const agent = AGENTS[selected];
  const stepIndex = run.steps.findIndex((s) => s.id === selected);
  const index = stepIndex >= 0 ? stepIndex : ORDER.indexOf(selected);
  const step: AgentStep | undefined = run.steps[stepIndex];
  const state: PanelState =
    index < shown ? (step?.status === "gap" ? "gap" : "done") : index === shown ? "working" : "queued";

  const rows = buildRows(run, selected);
  // Spread the rows evenly across the agent's turn, leaving room for the last mark to land.
  const gap = rows.length > 1 ? (AGENT_MS - 400 - RESOLVE_MS) / (rows.length - 1) : 0;
  const finished = state === "done" || state === "gap";

  const panelStyle = {
    "--ap-tint": agent.color,
    "--ap-run": `${AGENT_MS - 400}ms`,
  } as CSSProperties;

  return (
    <section className={`ap-panel ap-${state}`} style={panelStyle} aria-live="polite">
      <header className="ap-head">
        <img className="ap-avatar" src={agent.art} alt="" width={64} height={64} />
        <div className="ap-who">
          <h3 className="ap-name">{agent.name}</h3>
          <p className="ap-role">{agent.role}</p>
        </div>
        <span className={`ap-pill ap-pill-${state}`}>{PILL[state]}</span>
      </header>

      <div className="ap-progress" aria-hidden="true">
        <span key={`${selected}-${state}`} className="ap-progress-fill" />
      </div>

      <div className="ap-body">
        <div className="ap-rows-wrap">
          {state === "queued" && <p className="ap-waiting">Waiting for {agent.name}</p>}
          <ul key={`${selected}-${state}`} className="ap-rows">
            {rows.map((row, i) => (
              <li
                key={`${row.label}-${i}`}
                className={`ap-row ap-row-${row.mark}`}
                style={{ "--ap-d": `${Math.round(i * gap)}ms`, "--ap-r": `${Math.round(i * gap) + RESOLVE_MS}ms` } as CSSProperties}
              >
                <span className="ap-tile">
                  <Icon name={row.icon} />
                </span>
                <span className="ap-text">
                  <span className="ap-label">{row.label}</span>
                  {state !== "queued" && <span className="ap-result">{row.result}</span>}
                </span>
                {state !== "queued" && (
                  <span className="ap-status">
                    {state === "working" && <span className="ap-spinner" aria-hidden="true" />}
                    <MarkIcon mark={row.mark} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <aside className="ap-side">
          {finished && step ? (
            <Summary key={selected} step={step} />
          ) : (
            <p className="ap-side-note">
              {state === "working"
                ? `${agent.name} is checking the city's records for this lot.`
                : `${agent.name} starts once the agents before it finish.`}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
