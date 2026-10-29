"use client";

import { BuilderCards } from "@/components/BuilderCards";
import { PermitSheets } from "@/components/PermitSheets";
import dynamic from "next/dynamic";
import { AGENT_MS } from "@/components/AgentPanel";
import type { AgentId, RunRecord } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const Crew = dynamic(() => import("@/components/Crew").then((mod) => mod.Crew), { ssr: false });
const AgentPanel = dynamic(() => import("@/components/AgentPanel").then((mod) => mod.AgentPanel), { ssr: false });

// Leads the results with the answer: what the person asked for, and how the spot scored.
function verdict(run: RunRecord) {
  const c = run.constraints;
  const what = c.adu
    ? "A backyard ADU"
    : c.fourplex
      ? "A fourplex"
      : c.kind === "commercial"
        ? "A commercial building"
        : c.units
          ? `${c.units} ${c.units === 1 ? "home" : "homes"}`
          : "Your project";
  const fit =
    run.spot.band === "strong"
      ? "looks like a strong fit here"
      : run.spot.band === "possible"
        ? "looks possible here, with a few checks first"
        : "faces real hurdles here";
  return `${what} ${fit}.`;
}

const BAND = { strong: "Strong match", possible: "Possible", weak: "Weak match" };

type Tab = "permits" | "email" | "call" | "pushback";
const TABS: { id: Tab; label: string }[] = [
  { id: "permits", label: "Permit forms" },
  { id: "email", label: "Email" },
  { id: "call", label: "Call" },
  { id: "pushback", label: "Push back" },
];

function floodState(run: RunRecord) {
  const { fema, coaFlood } = run.field;
  if (fema.state === "hit" || coaFlood.state === "hit") return "hit";
  if (fema.state === "clear" && coaFlood.state === "clear") return "clear";
  return "unknown";
}

// Bold-stroke tile icons, drawn on a 32px grid.
const ICON = {
  zoning: (
    <>
      <rect x="4" y="4" width="10" height="10" />
      <rect x="18" y="4" width="10" height="10" />
      <rect x="4" y="18" width="10" height="10" />
      <rect x="18" y="18" width="10" height="10" fill="currentColor" />
    </>
  ),
  flood: (
    <>
      <path d="M16 3c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15z" />
      <path d="M3 28c3-2 5-2 8 0s5 2 8 0 5-2 8 0" />
    </>
  ),
  permits: (
    <>
      <path d="M7 3h13l6 6v20H7z" />
      <path d="M20 3v6h6M11 16h10M11 21h10" />
    </>
  ),
  builders: (
    <>
      <path d="M5 20a11 11 0 0 1 22 0" />
      <path d="M3 20h26v4H3zM14 9V6h4v3" />
    </>
  ),
};

function Tile({ icon, value, label }: { icon: keyof typeof ICON; value: string; label: string }) {
  return (
    <div className={`nb-tile nb-tile-${icon}`}>
      <svg className="nb-icon" viewBox="0 0 32 32" aria-hidden="true">
        {ICON[icon]}
      </svg>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function RunDesk({ id }: { id: string }) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(0);
  const [picked, setPicked] = useState<AgentId | null>(null);
  const [feedback, setFeedback] = useState("");
  const [revising, setRevising] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emailOk, setEmailOk] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);
  const [phone, setPhone] = useState("");
  const [script, setScript] = useState("");
  const [callOk, setCallOk] = useState(false);
  const [calling, setCalling] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [split, setSplit] = useState(58);
  const [allSteps, setAllSteps] = useState(false);
  const [tab, setTab] = useState<Tab>("permits");

  const replayKey = useMemo(
    () => (run ? `${run.spot.id}:${run.steps.map((step) => step.summary).join("|")}` : ""),
    [run],
  );

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/runs/${id}`);
        const data = (await response.json()) as RunRecord & { error?: string };
        if (!response.ok) throw new Error(data.error || "Research run not found.");
        if (!cancel) apply(data);
      } catch (caught) {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Research run not found.");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    void load();
    return () => {
      cancel = true;
    };
  }, [id]);

  useEffect(() => {
    if (!replayKey) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = replayKey.split("|").length;
    setPicked(null);
    if (reduce) {
      setShown(total);
      return;
    }
    setShown(0);
    // Functional updates so a Skip (which jumps straight to the total) also ends the timer cleanly.
    const timer = window.setInterval(() => {
      setShown((count) => {
        if (count + 1 >= total) window.clearInterval(timer);
        return Math.min(count + 1, total);
      });
    }, AGENT_MS);
    return () => window.clearInterval(timer);
  }, [replayKey]);

  function apply(next: RunRecord) {
    setRun(next);
    setEmailTo(next.email.to);
    setSubject(next.email.subject);
    setBody(next.email.body);
    setPhone(next.call.to);
    setScript(next.call.script);
    setEmailOk(false);
    setCallOk(false);
  }

  async function revise() {
    setRevising(true);
    setError("");
    try {
      const response = await fetch(`/api/runs/${id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      const data = (await response.json()) as RunRecord & { error?: string };
      if (!response.ok) throw new Error(data.error || "The review could not be applied.");
      apply(data);
      setFeedback("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The review could not be applied.");
    } finally {
      setRevising(false);
    }
  }

  async function sendEmail() {
    setSendingMail(true);
    setError("");
    try {
      const response = await fetch(`/api/runs/${id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo, subject, body, approved: emailOk }),
      });
      const data = (await response.json()) as RunRecord & { error?: string };
      if (data.email) apply(data);
      if (!response.ok) throw new Error(data.email?.error || data.error || "The email could not be sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The email could not be sent.");
    } finally {
      setSendingMail(false);
    }
  }

  async function placeCall() {
    setCalling(true);
    setError("");
    try {
      const response = await fetch(`/api/runs/${id}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone, script, approved: callOk }),
      });
      const data = (await response.json()) as RunRecord & { error?: string };
      if (data.call) apply(data);
      if (!response.ok) throw new Error(data.call?.error || data.error || "The call could not be placed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The call could not be placed.");
    } finally {
      setCalling(false);
    }
  }

  async function renderAerial() {
    setRendering(true);
    setError("");
    try {
      const response = await fetch(`/api/runs/${id}/render`, { method: "POST" });
      const data = (await response.json()) as RunRecord & { error?: string };
      if (!response.ok) throw new Error(data.error || "The aerial could not be rendered.");
      apply(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The aerial could not be rendered.");
    } finally {
      setRendering(false);
    }
  }

  if (loading) return <div className="boot">Reading the research…</div>;
  if (!run) return <div className="boot">{error || "Research run not found."}</div>;

  const total = run.steps.length;
  const ready = shown >= total;
  const selectedId: AgentId = picked ?? (shown < total ? run.steps[shown].id : run.steps[total - 1].id);
  const place = run.field.address ?? run.spot.name;
  const mapHref = `/?prompt=${encodeURIComponent(run.prompt)}&spot=${run.spot.id}`;
  const flood = floodState(run);
  const peek = flood === "hit" ? "levee" : run.spot.band === "weak" ? "stamp" : "zoney";
  const steps = allSteps ? run.checklist : run.checklist.slice(0, 3);

  return (
    <main className="run">
      <header className="run-bar">
        <Link href="/">BuildWright</Link>
        <Link href={mapHref}>Back to the map</Link>
      </header>
      <div className="run-wrap">
        <div className="nb-board">
          <div className={`nb-verdict nb-band-${run.spot.band}`}>
            <span className="nb-sticker nb-sticker-time">Research · {(run.durationMs / 1000).toFixed(1)}s on the city layers</span>
            <span className="nb-sticker nb-sticker-band">{BAND[run.spot.band]}</span>
            <h1>{verdict(run)}</h1>
            <p className="nb-place">{place}</p>
            <p className="nb-prompt">“{run.prompt}”</p>
            <img className="nb-peek nb-peek-verdict" src={`/crew/${peek}.png`} alt="" aria-hidden="true" />
          </div>
          <Tile icon="zoning" value={run.field.zoning ?? "—"} label="Zoning" />
          <Tile icon="flood" value={flood === "hit" ? "In floodplain" : flood === "clear" ? "Clear" : "Unknown"} label="Flood" />
          <Tile icon="permits" value={String(run.field.permits.length)} label="Permits nearby" />
          <Tile icon="builders" value={run.builders?.length ? String(run.builders.length) : "—"} label="Builders" />
        </div>
        {error ? <p className="error">{error}</p> : null}
        {run.revision ? (
          <div className="banner">
            <strong>{run.revision.moved ? `Recommendation moved to ${run.revision.toName}` : "Review notes"}</strong>
            {run.revision.note}
          </div>
        ) : null}
        {!ready ? (
          <div className="rc-skip">
            <button type="button" onClick={() => setShown(total)}>
              Skip the replay
            </button>
          </div>
        ) : null}
        <Crew run={run} shown={shown} selected={selectedId} onSelect={setPicked} />
        <AgentPanel run={run} shown={shown} selected={selectedId} />
        <section className="nb-card nb-next">
          <h2 className="nb-title">What to do next</h2>
          {ready ? (
            <>
              <div className="nb-steps">
                {steps.map((item, index) => (
                  <details key={item.n} className="nb-step" open={index === 0}>
                    <summary>
                      <span className="nb-step-num">{item.n}</span>
                      <span className="nb-step-title">{item.title}</span>
                      <svg className="nb-chevron" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
                      </svg>
                    </summary>
                    <div className="nb-step-body">
                      <p>{item.detail}</p>
                      <p className="nb-why">
                        <strong>Why</strong>
                        {item.why}
                      </p>
                      {item.href ? (
                        <a className="nb-chip" href={item.href} target="_blank" rel="noreferrer">
                          {item.hrefLabel ?? "City source"}
                        </a>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
              {run.checklist.length > 3 ? (
                <button type="button" className="nb-btn nb-more" onClick={() => setAllSteps((open) => !open)}>
                  {allSteps ? "Show the first 3" : `See all ${run.checklist.length} steps`}
                </button>
              ) : null}
            </>
          ) : (
            <p className="nb-wait">Opens when all five agents have reported.</p>
          )}
        </section>

        {ready ? (
          <section className="nb-builders-section">
            <header className="nb-builders-head">
              <h2 className="nb-title">Builders near this lot</h2>
              <img className="nb-peek nb-peek-foreman" src="/crew/foreman.png" alt="" aria-hidden="true" />
            </header>
            <BuilderCards builders={run.builders ?? []} />
          </section>
        ) : null}

        <section className="nb-card nb-act">
          <h2 className="nb-title">Take action</h2>
          <div className="nb-tabs" role="tablist" aria-label="Take action">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`nb-tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls="nb-tabpanel"
                className={tab === item.id ? "nb-tab on" : "nb-tab"}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="nb-tabpanel" id="nb-tabpanel" role="tabpanel" aria-labelledby={`nb-tab-${tab}`}>
            {tab === "permits" ? <PermitSheets run={run} ready={ready} onUpdated={apply} /> : null}

            {tab === "email" ? (
              <div className="stack nb-form">
                <label htmlFor="email-to">To</label>
                <input id="email-to" type="email" value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder="you@example.com" />
                <label htmlFor="email-subject">Subject</label>
                <input id="email-subject" type="text" value={subject} onChange={(event) => setSubject(event.target.value)} />
                <label htmlFor="email-body">Message</label>
                <textarea id="email-body" value={body} onChange={(event) => setBody(event.target.value)} />
                <label className="approve">
                  <input type="checkbox" checked={emailOk} onChange={(event) => setEmailOk(event.target.checked)} />
                  I approve sending this email
                </label>
                <button className="btn" type="button" disabled={!emailOk || sendingMail} onClick={() => void sendEmail()}>
                  {sendingMail ? "Sending…" : run.email.status === "sent" ? "Send again" : "Send the email"}
                </button>
                {run.email.status === "sent" ? <p className="muted">Sent. Reference {run.email.providerId}.</p> : null}
                {run.email.status === "failed" && run.email.error ? <p className="error">{run.email.error}</p> : null}
              </div>
            ) : null}

            {tab === "call" ? (
              <div className="stack nb-form">
                <p className="nb-note">The agent reads the script when the call connects. Use your own phone. This does not dial city staff.</p>
                <label htmlFor="phone">Number</label>
                <input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="512 555 0100" />
                <label htmlFor="script">Script</label>
                <textarea id="script" value={script} onChange={(event) => setScript(event.target.value)} />
                <label className="approve">
                  <input type="checkbox" checked={callOk} onChange={(event) => setCallOk(event.target.checked)} />
                  I confirm this number and want the call placed
                </label>
                <button className="btn" type="button" disabled={!callOk || calling} onClick={() => void placeCall()}>
                  {calling ? "Calling…" : run.call.status === "placed" ? "Call again" : "Place the call"}
                </button>
                {run.call.status === "placed" ? <p className="muted">Call placed. Reference {run.call.providerId}.</p> : null}
                {run.call.status === "failed" && run.call.error ? <p className="error">{run.call.error}</p> : null}
              </div>
            ) : null}

            {tab === "pushback" ? (
              <div className="nb-form">
                <p className="nb-note">The agents re-rank Austin and rewrite the checklist from what you say.</p>
                <div className="stack">
                  <label htmlFor="feedback">What should change?</label>
                  <textarea
                    id="feedback"
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Avoid the floodplain"
                  />
                </div>
                <div className="actions">
                  {["Avoid the floodplain", "Only 3 homes", "I want a fourplex"].map((choice) => (
                    <button key={choice} type="button" className="btn secondary" onClick={() => setFeedback(choice)}>
                      {choice}
                    </button>
                  ))}
                  <button className="btn" type="button" disabled={revising || feedback.trim().length < 2} onClick={() => void revise()}>
                    {revising ? "Revising…" : "Revise the research"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <div className="rc-hidden-aerial">
        <section className="card section">
          <p className="kicker">AutoHDR image pipeline</p>
          <h2>Massing on the aerial</h2>
          <p className="muted">
            The pipeline stitches a city aerial, corrects tone and color, sharpens it, and draws a roof plate. The plate is a diagram.
          </p>
          <div className="actions">
            <button className="btn" type="button" disabled={rendering} onClick={() => void renderAerial()}>
              {rendering ? "Rendering…" : run.render ? "Render again" : "Render this spot"}
            </button>
            <Link className="btn btn-build" href={`/runs/${id}/build`}>
              Design this build in 3D →
            </Link>
          </div>
          {run.render ? (
            <>
              <div className="slider" style={{ marginTop: 14 }}>
                <img src={`/api/media/${run.render.before}`} alt="City aerial of the spot before enhancement" />
                <img
                  className="after"
                  src={`/api/media/${run.render.after}`}
                  alt="Enhanced aerial with a disclosed roof-plate diagram"
                  style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  aria-label="Compare the aerial and the massing diagram"
                  onChange={(event) => setSplit(Number(event.target.value))}
                />
              </div>
              <ul className="changes">
                {run.render.changes.map((change) => (
                  <li key={change.step}>
                    <strong>{change.step}. </strong>
                    {change.note}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        </div>
      </div>
    </main>
  );
}
