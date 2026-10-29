"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { Builder } from "@/lib/types";

// Google Maps marks no one as verified, so a long review record stands in for it.
const VERIFIED_REVIEWS = 100;

function initials(name: string) {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function host(website: string | null) {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Reviewers show as first name and last initial, the way review sites print them.
function shortName(name: string) {
  const words = name.trim().split(/\s+/);
  const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
  if (words.length < 2) return cap(words[0] ?? "");
  return `${cap(words[0])} ${words[words.length - 1].charAt(0).toUpperCase()}.`;
}

function Star() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z" />
    </svg>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="bc-stars" role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} className="bc-star">
            <Star />
            <span className="bc-star-fill" style={{ width: `${Math.round(fill * 100)}%` }}>
              <Star />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function Logo({ builder }: { builder: Builder }) {
  const domain = host(builder.website);
  const [failed, setFailed] = useState(false);
  return (
    <span className="bc-logo">
      {domain && !failed ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initials(builder.name)}</span>
      )}
    </span>
  );
}

function Photo({ builder }: { builder: Builder }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="bc-photo">
      {builder.photo && !failed ? (
        <img src={builder.photo} alt={`${builder.name} on Google Maps`} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="bc-photo-empty" aria-hidden="true">
          {initials(builder.name)}
        </span>
      )}
      <Logo builder={builder} />
    </div>
  );
}

function BuilderCard({ builder }: { builder: Builder }) {
  const verified = (builder.reviews ?? 0) >= VERIFIED_REVIEWS;
  return (
    <article className="bc-card">
      <Photo builder={builder} />
      <div className="bc-body">
        <div className="bc-head">
          <h4 className="bc-name">
            {builder.name}
            {verified ? (
              <svg className="bc-verified" viewBox="0 0 24 24" role="img" aria-label="Over 100 reviews">
                <path d="M12 2l2.6 2.2 3.4-.3.8 3.3 2.9 1.8-1.3 3.1 1.3 3.1-2.9 1.8-.8 3.3-3.4-.3L12 22l-2.6-2.2-3.4.3-.8-3.3-2.9-1.8L3.6 12 2.3 8.9l2.9-1.8.8-3.3 3.4.3z" />
                <path className="bc-verified-tick" d="M8 12.2l2.7 2.7L16.2 9.4" />
              </svg>
            ) : null}
          </h4>
          {builder.category ? <span className="bc-cat">{builder.category}</span> : null}
        </div>

        {builder.rating != null ? (
          <div className="bc-rating">
            <Stars rating={builder.rating} />
            <span className="bc-rating-num">{builder.rating.toFixed(1)}</span>
            {builder.reviews != null ? <span className="bc-rating-count">({builder.reviews.toLocaleString("en-US")})</span> : null}
          </div>
        ) : (
          <div className="bc-rating bc-rating-none">No Google rating yet</div>
        )}

        {builder.review ? (
          <blockquote className="bc-review">
            <p>&ldquo;{builder.review}&rdquo;</p>
            {builder.reviewer ? <cite>{shortName(builder.reviewer)}</cite> : null}
          </blockquote>
        ) : null}

        <div className="bc-chips">
          {builder.phone ? (
            <a className="bc-chip" href={`tel:${builder.phone.replace(/[^+\d]/g, "")}`}>
              {builder.phone}
            </a>
          ) : null}
          {builder.website ? (
            <a className="bc-chip" href={builder.website} target="_blank" rel="noreferrer">
              Website
            </a>
          ) : null}
          {builder.mapsUrl ? (
            <a className="bc-chip" href={builder.mapsUrl} target="_blank" rel="noreferrer">
              Google Maps
            </a>
          ) : null}
          {builder.address ? (
            <span className="bc-chip bc-chip-muted" title={builder.address}>
              {builder.address.replace(/,\s*(TX|Texas)\s*\d{5}.*$/, "")}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function BuilderCards({ builders }: { builders: Builder[] }) {
  if (!builders.length) return null;
  return (
    <div className="bc-grid">
      {builders.map((builder) => (
        <BuilderCard key={builder.mapsUrl ?? builder.name} builder={builder} />
      ))}
    </div>
  );
}
