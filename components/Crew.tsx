"use client";

import type { AgentId, RunRecord } from "@/lib/types";

// The five research agents drawn as a crew of glossy characters, one per agent card.
// The art is generated renders in public/crew; the motion is CSS (app/theme.css), driven by
// each agent's state: queued, working, done (a hop) or gap (a shrug). With onSelect the cards
// become buttons that pick which agent the panel below shows (styles in app/crew-scan.css).

export type CrewState = "queued" | "working" | "done" | "gap";
type Member = { name: string; role: string; art: string };

const CREW: Record<AgentId, Member> = {
  codes: { name: "Zoney", role: "Zoning and codes", art: "/crew/zoney.png" },
  hazards: { name: "Levee", role: "Flood and hazards", art: "/crew/levee.png" },
  permits: { name: "Stamp", role: "Permit history", art: "/crew/stamp.png" },
  development: { name: "Foreman", role: "Filing path", art: "/crew/foreman.png" },
  environmental: { name: "Fern", role: "Creeks and trees", art: "/crew/fern.png" },
};

// What each agent turned up, for the "!" marks and the line under its name.
function finding(run: RunRecord, id: AgentId): { found: boolean; line: string } {
  const f = run.field;
  switch (id) {
    case "codes":
      return { found: Boolean(f.zoning), line: f.zoning ? `Zoned ${f.zoning}` : "Zoning missing" };
    case "hazards": {
      const wet = [f.fema, f.coaFlood, f.nearFlood].some((check) => check.state === "hit");
      return { found: wet, line: wet ? "Flood zone found" : "No flood zone" };
    }
    case "permits":
      return {
        found: f.permits.length > 0,
        line: f.permits.length ? `${f.permits.length} permits nearby` : "No permits nearby",
      };
    case "development":
      return { found: false, line: "Next steps ready" };
    case "environmental": {
      const wet = f.creek.state === "hit";
      return { found: wet, line: wet ? "Creek nearby" : "No creek nearby" };
    }
  }
}

// The real layers each agent reads, listed under it on the loading sheet.
const SCANS: Record<AgentId, string[]> = {
  codes: ["Zoning map", "Base district", "Historic districts"],
  hazards: ["FEMA flood zones", "City floodplain", "Pipelines", "Wildfire", "Airport"],
  permits: ["Building permits nearby"],
  development: ["Your request", "Filing path rules"],
  environmental: ["Creek buffers", "Floodplains"],
};

type RowMember = Member & { id: AgentId; state: CrewState; found: boolean };

function statusLine(member: RowMember & { line: string }): string {
  return member.state === "queued"
    ? "Waiting"
    : member.state === "working"
      ? "Reading the city layers…"
      : member.state === "gap"
        ? "Some layers did not answer"
        : member.line;
}

export function Crew({
  run,
  shown,
  selected,
  onSelect,
}: {
  run: RunRecord;
  shown: number;
  selected?: AgentId;
  onSelect?: (id: AgentId) => void;
}) {
  const members = run.steps.map((step, index) => {
    const state: CrewState =
      index < shown ? (step.status === "gap" ? "gap" : "done") : index === shown ? "working" : "queued";
    return { id: step.id, ...CREW[step.id], state, ...finding(run, step.id) };
  });

  return (
    <section className={`crew${onSelect ? " cs-pickable" : ""}`} aria-label="The research crew">
      <div className="crew-row">
        {members.map((member, index) => (
          <Card
            key={member.id}
            member={member}
            index={index}
            picked={selected === member.id}
            label={`${member.name}, ${statusLine(member)}`}
            onSelect={onSelect}
          />
        ))}
      </div>
      <div className="crew-row crew-labels">
        {members.map((member) => (
          // mouse shortcut only; the card above is the keyboard target
          <div
            key={member.id}
            className={selected === member.id ? "cs-picked" : undefined}
            onClick={onSelect ? () => onSelect(member.id) : undefined}
          >
            <b>{member.name}</b>
            <span>{member.role}</span>
            <em aria-live="polite">{statusLine(member)}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

// Shown over the map while the agents run, before the results page exists.
export function CrewOverlay({ place }: { place: string }) {
  const members = (Object.keys(CREW) as AgentId[]).map((id) => ({
    id,
    ...CREW[id],
    state: "working" as CrewState,
    found: false,
  }));
  return (
    <div className="crew-overlay" role="status">
      <div className="crew-sheet">
        <p className="kicker">Five agents on it</p>
        <h2>Reading Austin&apos;s city layers for {place}</h2>
        <div className="crew-row">
          {members.map((member, index) => (
            <Card key={member.id} member={member} index={index} />
          ))}
        </div>
        <div className="crew-row crew-labels">
          {members.map((member, index) => (
            <div key={member.id}>
              <b>{member.name}</b>
              <span>{member.role}</span>
              <ul className="cs-scan" aria-label={`${member.name} is reading`}>
                {SCANS[member.id].map((layer, j) => (
                  <li key={layer} style={{ "--j": index * 2 + j } as React.CSSProperties}>
                    <i className="cs-spin" aria-hidden="true" />
                    {layer}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({
  member,
  index,
  picked = false,
  label,
  onSelect,
}: {
  member: RowMember;
  index: number;
  picked?: boolean;
  label?: string;
  onSelect?: (id: AgentId) => void;
}) {
  const found = member.state === "done" && member.found;
  const className = `crew-card is-${member.state}${found ? " is-found" : ""}${picked ? " cs-selected" : ""}`;
  const style = { "--i": index } as React.CSSProperties;
  // a button may only hold phrasing content, so the art wrappers become spans there
  const Box = onSelect ? "span" : "div";
  const inner = (
    <>
      {member.state === "done" ? (
        <span className="crew-badge ok" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : member.state === "gap" ? (
        <span className="crew-badge gap" aria-hidden="true">!</span>
      ) : null}

      {/* hop wraps breathe/type so the two animations never fight over one transform */}
      <Box className="crew-hop" aria-hidden="true">
        <Box className="crew-body">
          <img src={member.art} alt="" draggable={false} />
        </Box>
      </Box>

      {member.state === "working" ? (
        <span className="crew-typing" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : null}

      {found ? (
        <svg className="crew-ticks" viewBox="0 0 40 30" aria-hidden="true">
          <path d="M6 22 L11 15 M20 18 L20 6 M34 22 L29 15" fill="none" stroke="#ffb020" strokeWidth="4" strokeLinecap="round" />
        </svg>
      ) : null}

      {member.state === "done" ? (
        <span className="crew-sparks" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : null}

      {member.state === "gap" ? <span className="crew-sweat" aria-hidden="true" /> : null}
    </>
  );

  if (!onSelect) {
    return (
      <div className={className} style={style}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={label}
      aria-pressed={picked}
      onClick={() => onSelect(member.id)}
    >
      {inner}
    </button>
  );
}
