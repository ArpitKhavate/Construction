# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
First-time builders: people who have money and a lot (or a candidate lot) but no development background. They don't know what they're allowed to build, which permits apply, or who to contact. The founding story is a teammate's mother who wants to build in Pennsylvania and doesn't know where to start.

## Product Purpose
Enter an Austin, TX address and an idea (for example a backyard ADU). Get a report on zoning, permits, hazards and cost, where each finding links to its source, plus a step-by-step checklist that names who to contact for each step. Success: a beginner leaves knowing what they can build and what to do next.

## Positioning
Existing tools (Spark, PermitPortal, AutoSitu, Permitify) serve professionals. Construction serves the first-timer, in plain language, with sources attached to findings.

## Operating Context
Built for a hackathon. Judged Fri 2026-10-30 at a table with repeated short demos and Q&A; tracks AutoHDR and Antler. Demo city is Austin (open zoning, permit and flood data); Pennsylvania is the pitch story. Demo parcel: 3105 Cherrywood Rd, Austin, TX 78722 (SF-3-NP, ~8,383 sq ft).

## Capabilities and Constraints
- Next.js + TypeScript app in `web/`, data in Supabase, scraping via Apify, agents on Claude Haiku.
- Reports are precomputed for demo parcels; unknown addresses are not analyzed live yet.
- Working name "Construction" (placeholder).
- Report must carry a disclaimer: research, not a zoning determination.

## Evidence on Hand
- Real: zoning, lot size and floodplain status for the demo parcel (City of Austin / TCAD layers); 10 Austin ADU builders with phones and ratings (Apify Google Maps).
- Placeholder: cost figures and scores in the seeded report.
- Sourced stats: IDC survey, 75% of owners over budget, 77% late (all sectors); Austin housing stock +30% 2015-2024 and median rent $1,546 to $1,296 (Pew). No customers, testimonials or pricing exist; do not invent them.

## Product Principles
1. Plain language for someone who has never built anything.
2. Every finding shows where it came from.
3. Always end on a next step and a person to contact.
4. The demo must be fast and never stall on a live call.
