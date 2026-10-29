"use client";

import type { RunRecord } from "@/lib/types";
import { useState } from "react";

const FORM_URL = "https://services.austintexas.gov/edims/document.cfm?id=422972";
const SITE_PLAN = "https://www.austintexas.gov/development-services/site-plan-requirements";
const RESIDENTIAL = "https://www.austintexas.gov/development-services/residential-plan-review";

export function PermitSheets({
  run,
  ready,
  onUpdated,
}: {
  run: RunRecord;
  ready: boolean;
  onUpdated: (run: RunRecord) => void;
}) {
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState("");
  const packet = run.permitsPacket ?? null;
  const preview = applicationPreview(run);

  async function fill() {
    setFilling(true);
    setError("");
    try {
      const response = await fetch(`/api/runs/${run.id}/permits`, { method: "POST" });
      const data = (await response.json()) as RunRecord & { error?: string };
      if (!response.ok) throw new Error(data.error || "The permits could not be filled.");
      onUpdated(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The permits could not be filled.");
    } finally {
      setFilling(false);
    }
  }

  return (
    <div className="nb-permits">
      <p className="nb-note">The city's own forms, filled from this research. Read every line, download the PDFs. Nothing is submitted.</p>
      {packet ? (
        <>
          <p className="nb-clerk">{packet.clerkNote}</p>
          <div className="nb-permit-grid">
            {packet.forms.map((form) => (
              <article key={form.id} className="nb-paper" id={`permit-${form.id}`}>
                <span className="nb-sticker nb-sticker-draft">Draft — not submitted</span>
                <h3>{form.title}</h3>
                <div className="nb-paper-actions">
                  <a className="nb-btn nb-btn-ink" href={`/api/runs/${run.id}/permits/${form.id}`} download={form.fileName}>
                    Download PDF
                  </a>
                  <a href={`/api/runs/${run.id}/permits/${form.id}`} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                  <a href={form.sourceUrl} target="_blank" rel="noreferrer">
                    {form.sourceLabel}
                  </a>
                </div>
                <details className="nb-paper-lines">
                  <summary>Read every line</summary>
                  <p>{form.intro}</p>
                  {form.sections.map((section) => (
                    <div key={section.title}>
                      <h4>{section.title}</h4>
                      <dl>
                        {section.fields.map((item) => (
                          <div key={item.label} className={item.tone}>
                            <dt>{item.label}</dt>
                            <dd>{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </details>
              </article>
            ))}
          </div>
          <button className="btn secondary" type="button" disabled={filling} onClick={() => void fill()}>
            {filling ? "The permit clerk is writing the applications…" : "Fill again"}
          </button>
        </>
      ) : (
        <>
          <article className="nb-paper nb-paper-wait">
            <span className="nb-sticker nb-sticker-draft">Waiting for the clerk</span>
            <h3>{preview.title}</h3>
            <p>{preview.note}</p>
            <ul className="nb-permit-names">
              <li>{preview.title}</li>
              <li>Electrical permit request</li>
              <li>Plumbing permit request</li>
              <li>Mechanical permit request</li>
            </ul>
            <p>
              <a href={preview.href} target="_blank" rel="noreferrer">
                {preview.link}
              </a>
            </p>
          </article>
          {run.revision ? <p>The research changed. Fill the permits so the drafts match this spot.</p> : null}
          <button className="btn" type="button" disabled={!ready || filling} onClick={() => void fill()}>
            {filling ? "The permit clerk is writing the applications…" : "Fill the permits"}
          </button>
          {ready ? null : <p className="muted">The clerk starts after all five agents have reported.</p>}
        </>
      )}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function applicationPreview(run: RunRecord) {
  const residential =
    run.constraints.kind === "housing" && !run.constraints.fourplex && (run.constraints.units == null || run.constraints.units <= 4);
  if (run.constraints.fourplex) {
    return {
      title: "Commercial Plan Review project information",
      note: "A fourplex is one building with four dwellings. Austin files that through Commercial Plan Review, not the residential four-unit form. The same click still writes the electrical, plumbing, and mechanical requests.",
      href: RESIDENTIAL,
      link: "Residential plan review, fourplex projects",
    };
  }
  if (!residential) {
    return {
      title: "Site plan project information",
      note: "More than four homes is past the residential site-plan exemption. The click fills a site-plan intake from the city layers, plus the three trade requests.",
      href: SITE_PLAN,
      link: "Austin site plan requirements",
    };
  }
  return {
    title: "Residential New Construction and Addition Permit Application",
    note: "Property, required reviews, and the description of work follow that city form. Electrical, plumbing, and mechanical are requested with it.",
    href: FORM_URL,
    link: "City of Austin residential application",
  };
}
