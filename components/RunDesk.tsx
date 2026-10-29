"use client";

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

  return (
    <main className="run">
      <header className="run-bar">
        <Link href="/">Construction</Link>
        <Link href={mapHref}>Back to the map</Link>
      </header>
      <div className="run-wrap">
        <div className="lede">
          <p className="kicker">Research · {(run.durationMs / 1000).toFixed(1)}s on the city layers</p>
          <h1>{place}</h1>
          <p className="verdict">{verdict(run)}</p>
          <p className="muted">
            {run.spot.name} · {run.field.zoning ?? "Zoning missing"} · {BAND[run.spot.band]}
          </p>
          <p>{run.prompt}</p>
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
        <section className="card section rc-checklist">
          <p className="kicker">Beginner checklist</p>
          <h2>What to do next</h2>
          {ready ? (
            <div className="rc-steps">
              {run.checklist.map((item, index) => (
                <details key={item.n} className="rc-step" open={index === 0}>
                  <summary>
                    <span className="rc-step-num">{item.n}</span>
                    <span className="rc-step-title">{item.title}</span>
                    <svg className="rc-chevron" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="rc-step-body">
                    <p>{item.detail}</p>
                    <div className="rc-why">
                      <span>Why this is on the list</span>
                      {item.why}
                    </div>
                    {item.href ? (
                      <a className="rc-chip" href={item.href} target="_blank" rel="noreferrer">
                        {item.hrefLabel ?? "City source"}
                      </a>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="muted">The checklist opens when all five agents have reported.</p>
          )}
          {ready && run.builders?.length ? (
            <div className="rc-builders-wrap">
              <p className="kicker">Local builders</p>
              <div className="rc-builders">
                {run.builders.map((builder) => (
                  <article key={builder.name} className="rc-builder">
                    <header>
                      <h3>{builder.name}</h3>
                      <span className={builder.rating != null ? "rc-rating" : "rc-rating none"}>
                        {builder.rating != null ? `★ ${builder.rating.toFixed(1)}` : "No rating yet"}
                      </span>
                    </header>
                    <p className="rc-reviews">
                      {builder.reviews != null ? `${builder.reviews} Google reviews` : "No reviews yet"}
                    </p>
                    {builder.address ? <p className="rc-address">{builder.address}</p> : null}
                    <div className="rc-links">
                      {builder.phone ? <a href={`tel:${builder.phone.replace(/[^\d+]/g, "")}`}>{builder.phone}</a> : null}
                      {builder.website ? (
                        <a href={builder.website} target="_blank" rel="noreferrer">
                          Website
                        </a>
                      ) : builder.mapsUrl ? (
                        <a href={builder.mapsUrl} target="_blank" rel="noreferrer">
                          Google Maps
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <PermitSheets run={run} ready={ready} onUpdated={apply} />

        <section className="card section">
          <p className="kicker">Feedback and review</p>
          <h2>Push back</h2>
          <p className="muted">The agents re-rank Austin and rewrite the checklist from what you say.</p>
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
        </section>

        <section className="card section">
          <p className="kicker">AutoHDR image pipeline</p>
          <h2>Massing on the aerial</h2>
          <p className="muted">
            The pipeline stitches a city aerial, corrects tone and color, sharpens it, and draws a roof plate. The plate is a diagram.
          </p>
          <button className="btn" type="button" disabled={rendering} onClick={() => void renderAerial()}>
            {rendering ? "Rendering…" : run.render ? "Render again" : "Render this spot"}
          </button>
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

        <div className="split section">
          <section className="card">
            <p className="kicker">Email</p>
            <h2>Send after approval</h2>
            <div className="stack">
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
          </section>
          <section className="card">
            <p className="kicker">Phone</p>
            <h2>Place a real call</h2>
            <p className="muted">
              The agent reads the script when the call connects. Use your own phone for the demo. This does not dial city staff.
            </p>
            <div className="stack">
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
          </section>
        </div>
      </div>
    </main>
  );
}
