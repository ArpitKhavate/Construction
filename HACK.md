# HACK.md

> Shared plan for the team. Every calhacks-kit skill reads and updates this file.
> Keep it short. If it no longer fits on one screen, the scope is too big.

## Event
- Event: <name not given yet>
- Submission deadline: 2026-10-29 17:00 CDT (Thu). Plan to submit by 16:00.
- Judging: Fri 2026-10-30, 13:00-16:00, at a table with Q&A. Repeat short demos for three hours.
- Judging criteria: Application, Functionality/Quality, Creativity, Technical Complexity
- Rules to respect: team confirmed no pre-written-code rule applies. Constructa repo was read for ideas only.
- Tracks we target: AutoHDR, Antler

## Team
| Name | Strengths | Owns |
|------|-----------|------|
| <A>  | Full-stack, lots of hackathon experience | Proposed: data + agents (Apify, Supabase, extractor, specialists, quote check, scoring) |
| <B>  | Full-stack, lots of hackathon experience | Proposed: app + demo (parcel form, report screen with clickable citations, checklist, pitch) |

Roles are undecided. The split above is a proposal.

## Problem
- One sentence: First-time builders struggle to find out what they can build on a parcel and which permits they will need, because zoning, permit and hazard rules are scattered across local government sources.
- The user: a first-time builder with a specific parcel and a rough idea (for example an ADU or small multi-family), no development background.
- Why it matters (story): a teammate's mother has the money to build a property in Pennsylvania but doesn't know who to contact, how to go about it, or what to do.
- Why it matters (numbers, sourced): permit timelines roughly doubled from ~2 to ~4 months in one multi-city study; one industry group estimates $22K+ holding cost per delayed home in Washington. Austin grew its housing stock ~30% (2015-2024) and median rent fell from $1,546 (Dec 2021) to $1,296 (Jan 2026) per Pew. IDC survey: 75% of owners over budget, 77% late (all sectors, not housing-specific).
- Dropped the unsourced "30% over budget and a year behind" stat; use the IDC figure (75% over budget, 77% late) instead.
- What's different about our approach: existing tools (Spark, PermitPortal, AutoSitu, Permitify) serve professionals; we serve the beginner, and every claim carries a code-verified citation.

## MVP: the one journey (happy path)
1. Enter a parcel and an idea.
2. Get the specialist report: zoning, permits, hazards and cost, each claim cited.
3. Get the permit checklist the beginner needs next, including who to contact for each step.

Done means: the demo shows a real parcel in one state going from address + idea to a cited report and permit checklist, end to end. City: Austin, TX (decided Tue night). Reason: open structured permit data and city GIS layers. Pennsylvania (the mother's project) stays the pitch story, not the demo.

Rules for the report:
- Every fact carries an exact quote and source URL; code confirms the quote appears in the source.
- Scores come from a formula in code, never from the model.

## Stretch goals (only after the happy path works)
1. "What to build": idea to a simple massing or 3D model / realistic images (AutoHDR track).
2. Auto-filled permit forms (PDF) for the checklist.
3. "Where to build": a scored shortlist of parcels on a map.
4. Extra specialists: community sentiment, utilities, environmental review.
5. Live "run a new parcel" button at the table.

## Cut list
- Login, settings, onboarding: use a seeded demo account.
- Multi-state coverage: one state only.
- Site foreman and inspection tools: different user and workflow.
- Payments, accounts, notifications.

## Stack
- Decided: Next.js + TypeScript, Supabase (Postgres, queues), Apify (ingestion), Claude (all agents on claude-haiku-5-5 for now; upgrade later if needed), fan-out fixed in code.
- Riskiest integration: Apify actor -> Claude extraction -> quote check. Spike result: pending (do tonight).

Architecture:
```
user -> app -> queue (Supabase) -> extractor -> specialists (parallel) -> code checks -> Supabase tables -> report
```

## Honesty
Mocked, hardcoded, or seeded parts we will disclose in the demo:
- Team decision (Wed): demo first. Fake or seeded data and stand-ins are allowed wherever the real path is too slow or missing.
- Planned: no code copied from Constructa. If any is, disclose it.
- Third-party libraries, APIs and scrapers used will be listed in the README.

## Pitch
- One-liner: <Product> helps first-time builders find out what they can build on a parcel and what permits they need, by running specialist agents over public records and verifying every citation in code.
- Roles: driver <name>, narrator <name>, tech answers <name>, backup <name>

## Status log
- 21:38 Tue Scoped MVP: happy path agreed, stretch goals recorded. Open: parcel and municipality, Q3 differentiation, event name. Next: /hack-stack
- Tue night Q2 answered (mom's PA project plus sourced numbers). Added "who to contact" to checklist.
- Tue night Decided demo city: Austin, TX. Next: confirm data sources per specialist, then /hack-stack.
- Wed Name: "Construction" for now. Demo parcel: a real SF-3 lot near UT Austin (bonus if near Antler's office), to be verified via the zoning API. One person owns both A and B for now; teammates merge their best pieces later. Added .env.example; keys pending; Supabase MCP to be connected.
- Wed Decisions: tracks AutoHDR + Antler; stack Next.js/Supabase/Claude/Apify; whiteboard extras (calls/emails, developer contact, Zillow, 3D) are stretch goals; number of specialists flexible; faking data is OK for the demo; use Apify wherever it fits. Apify MCP connection confirmed working.
- Wed late: Next.js app in `web/` (home form + report page) reading from Supabase project "construction". Tables: parcels, sources, reports. Demo parcel 3105 Cherrywood Rd (SF-3-NP, 8,383 sq ft, not in FEMA floodplain; verified via city/TCAD layers). Seeded report: zoning/lot/flood real, ADU builder contacts real (Apify Google Maps, 10 places), cost + scores placeholder. Next: Haiku agent pipeline to replace the seed.
