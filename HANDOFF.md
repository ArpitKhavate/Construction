# HANDOFF.md

Context handoff for a Claude Code terminal session. Read this file first, then `HACK.md` (the short shared plan; keep its Status log updated). Everything here comes from a prior research and planning session. Items marked **(unverified)** were not confirmed against the live source and must be checked before you rely on them.

Working folder: `C:\Users\ZARA\Desktop\Construction`. A clone of the reference repo (read-only study material, do not copy code from it) is at `C:\Users\ZARA\Desktop\Construction\Constructa`.

---

## 1. Deadline and judging

- Today when this was written: Tuesday 2026-10-27, evening (CDT).
- Submission deadline: **Thursday 2026-10-29, 17:00 CDT.** Aim to submit by 16:00.
- Judging: **Friday 2026-10-30, 13:00 to 16:00**, at a table with Q&A. The demo is repeated for three hours, so the main demo must be fast and must never depend on a slow live call.
- Team: 2 people, both strong full-stack engineers with hackathon experience. Roles not decided. Proposed split: A = data and agents, B = app and demo.
- Judging criteria: Application, Functionality/Quality, Creativity, Technical Complexity.

Working budget (about 30 working hours each after sleep):

| Phase | When | Goal |
|---|---|---|
| Build | Tue 21:15 to Wed 22:00 | Happy path works end to end for one parcel |
| Harden | Wed 22:00 to Thu 02:00, Thu 08:00 to 09:00 | Never breaks, demo parcels precomputed, deployed |
| Demo prep | Thu 09:00 to 13:00 | README, backup video, pitch, likely Q&A |
| Buffer | Thu 13:00 to 16:00 | Fix what broke, submit |

---

## 2. What we are building

A research tool for a **first-time builder**: someone with money and a plot of land (or a candidate lot) who has no development background and doesn't know what is allowed, what permits apply, or who to contact.

Origin of the idea: a teammate's mother wants to build a property in Pennsylvania, has the money, and doesn't know who to contact, how to go about it, or what to do. We demo in **Austin, TX** instead of Pennsylvania because Austin publishes structured open data (Pennsylvania has 2,562 municipalities and no statewide zoning data). Pennsylvania is the pitch story, Austin is the demo.

Existing competitors all serve professionals: Spark (energy developers, TypeScript/Next.js/NestJS/Postgres), PermitPortal (pre-construction OS, stack unpublished), AutoSitu (plan review for cities and developers, Next.js/Supabase/Mastra/Inngest), Permitify (plan review, $297 pre-submittal review). The beginner is our gap.

### The happy path (the only thing that must work)

1. User enters a **parcel** (an Austin address) and an **idea** (what they want to build).
2. App returns a **specialist report**: zoning, permits, hazards, cost. Every claim is cited.
3. App returns a **permit checklist** for the next steps, including **who to contact** for each step.

### Stretch goals (only after the happy path works, in this order)

1. Auto-filled permit forms (PDF) for the checklist.
2. "Where to build": scored shortlist of parcels on a map.
3. "What to build": idea to a simple massing or 3D model.
4. More specialists: community sentiment, utilities, environmental review.
5. A live "run a new parcel" button at the table.

### Cut list

Login and settings (use a seeded demo account), multi-city coverage, site foreman and inspection tools, payments, notifications.

### Demo parcel and idea (default, change one line to override)

**Default: an ADU (accessory dwelling unit) on a typical SF-3 lot in Austin.** The first spike picks a real address in an SF-3 zone. Confirm the address with the user before building the demo around it. If the user gives a specific address, use that.

Plain-English terms: an ADU is a small second home on the same lot (backyard cottage, garage apartment). SF-3 is Austin's zone code for ordinary single-family lots. HOME is Austin's 2023 and 2024 rule change allowing up to 3 homes on such lots.

---

## 3. Non-negotiable rules

These came from an audit of the reference repo (Constructa), which looked good but faked most outputs. We are deliberately not doing that.

1. **No fabricated data or citations.** Never invent a URL, a quote, a score or a fact. If a source can't be fetched, the claim is omitted and the report says it could not be checked.
2. **Two kinds of claims, two kinds of proof.**
   - *Text claims* (from the HOME page, the ADU page, code text): store an exact quote and source URL. **Code verifies the quote appears verbatim in the stored source text.** A claim that fails the check is dropped.
   - *Data claims* (zone code, flood status, permit counts): store the dataset ID or service URL and the exact query, so anyone can re-run it and get the same answer.
3. **Scores come from a formula in code, never from a model.** Models extract facts and write prose from verified facts only.
4. **Stored runs must be real pipeline output.** Precomputing demo parcels is fine; hand-typing results is not. Never describe a stored run as live.
5. **Team decision: no "cached" badge in the UI.** Do not add one. The README honesty section must still say demo parcels are precomputed by the real pipeline, and the team must say so if a judge asks. The pitch and README must not claim a stored run was live.
6. **Every report shows**: the retrieval date of each source ("as of ..."), and a disclaimer: this is research, not a zoning determination (the City of Austin itself says its zoning data is not for determinations and omits overlays).
7. **Statistics need sources.** The claim "30% of housing projects are over budget and a year behind" has no source; do not use it. Sourced numbers are in `HACK.md`.
8. **Secrets**: keys live in `.env.local`, never committed. The Supabase service-role key is server-side only.
9. **Confirm with the user before any single run you estimate will cost more than about $5** (Claude, Apify).

---

## 4. Stack (decided)

- **Next.js + TypeScript**, one repo for UI and server routes.
- **Supabase**: Postgres (consider PostGIS for point-in-polygon), queues (pgmq) if needed.
- **Apify**: only for listings (land comps). Austin's zoning, permits and flood data are free open-data APIs, which are more reliable than scrapers. Do not use Apify where an official API exists.
- **Claude API** via the official TypeScript SDK (`@anthropic-ai/sdk`). **Invoke the `claude-api` skill before writing any Claude call**; the API changed a lot in 2025-2026.
- Accounts and keys: the user says the Supabase project, Apify account and Anthropic API key all exist. Ask for them via env vars; never ask the user to paste secrets into chat.

Models (exact IDs, no date suffixes):

| Role | Model ID | Price per million tokens (in / out) |
|---|---|---|
| Extractor | `claude-haiku-5-5` | $0.10 / $0.50 (prompts up to 100K tokens) |
| Specialists | `claude-sonnet-5-5` | $2 / $10 |
| Lead / summary | `claude-opus-5-5` | $4 / $20 |

Web search tool, if used: $10 per 1,000 searches on top of tokens.

API gotchas (from the claude-api skill; re-check there):
- Opus 5.5 and Sonnet 5.5 reject forced tool use (`tool_choice` any/tool returns 400). Use `auto` plus `strict: true` tools, or structured outputs (`output_config.format`).
- Thinking cannot be disabled on Opus 5.5; do not send `budget_tokens`; no `temperature`, `top_p`, `top_k`; no assistant prefill.
- Opus 5.5 default effort is `medium`; set effort explicitly.
- Stream long requests.

Where to run the pipeline: **Supabase Edge Functions are a poor fit** (paid plans: 400 s wall clock, 2 s CPU, 256 MB). Run the pipeline as a Node/TS script (for example `npm run pipeline -- --address "..."`) that writes to Supabase. The web app only reads stored results. A live "run now" route is a stretch goal.

---

## 5. Architecture

```
address + idea
  -> resolve parcel (lat/lng, council district, zone code)
  -> fetch sources (APIs, pages) -> store raw text + hash
  -> extractor (Haiku): text -> structured facts with exact quotes
  -> specialists in PARALLEL (Sonnet), fixed fan-out in code:
       zoning, permits, hazards, cost
  -> code checks: quote verification, data-claim re-query, score formulas
  -> lead (Opus): short summary from VERIFIED facts only
  -> checklist with who-to-contact
  -> store report
```

Rules for delegation:
- Fan-out to all four specialists is decided by **code**, not by a model, so no factor is silently skipped.
- Specialists report **facts and quotes, not scores**. They do not talk to each other; they report to the lead.
- Each specialist has a narrow system prompt, its own allowed sources and its own output schema.
- The lead only reads verified facts. It may request one follow-up brief to a specialist if a gap or contradiction exists.
- Delegation briefs must be self-contained (parcel id, question, output schema), because workers cannot see each other's context.

---

## 6. Data sources for Austin

All of these were found by search; none has been called live yet.

| Specialist | Source | Notes |
|---|---|---|
| Zoning (data) | City zoning layers, e.g. https://services.arcgis.com/0L95CJ0VTaxqcmED/ArcGIS/rest/services/PLANNINGCADASTRE_zoning_ordinance/FeatureServer and https://services.arcgis.com/0L95CJ0VTaxqcmED/ArcGIS/rest/services/DDB_Phase_1_Web_Layers/FeatureServer/5 | Query by point. Spatial reference 2277 (Texas State Plane feet); max 2000 records per query; supports JSON, GeoJSON, PBF. Layer does not show overlays or multiple zonings. Credit "City of Austin, Geospatial Services - Data Development". |
| Zoning (rules text) | https://www.austintexas.gov/development-services/home-amendments | HOME Phase 1 adopted 2023-12-07 (up to 3 units on SF-1, SF-2, SF-3). Phase 2 adopted 2024-05-16 (about two-thirds less land per unit). Site Plan Lite Phase 2 and Infill Plat adopted 2025-03-06. A proposal to simplify rules was pending; **adoption unconfirmed (unverified)**. The Austin Land Development Code is probably on Municode **(unverified)**. |
| Permits (process) | https://www.austintexas.gov/page/adu | Official. Steps: AB+C portal account, the new unit needs its own address (Address Management Services), intake completeness check, pay plan-review fees, then review starts. |
| Permits (history) | Dataset `3syk-w9eu`, "Issued Construction Permits", https://catalog.data.gov/dataset/issued-construction-permits | Free Socrata API on data.austintexas.gov. Has issue date, council district, work description, square footage, valuation, units. **Whether it has an application date is unconfirmed**; check https://data.austintexas.gov/api/views/3syk-w9eu.json. Another ID, `kadb-t938` (story board), also appears. |
| Hazards (flood) | "Greater Austin FEMA Floodplain", dataset `neg3-2fup`, https://catalog-old.data.gov/dataset/greater-austin-fema-floodplain | Updated March 2026 per the catalog. |
| Hazards (aquifer) | City dataset `9883-ztc6` (Edwards Aquifer contributing zone watersheds); TCEQ recharge zone, https://www.tceq.texas.gov/gis/metadata/edwards_met.html; Travis County service, https://gis.traviscountytx.gov/server1/rest/services/Natural_Resources/Aquifers/MapServer | Contributing-zone boundaries were modeled from 2003 LIDAR. Not for legal use. Wildfire and soil risk were **not researched**. |
| Cost (land) | Travis County parcel layer https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD/MapServer ; tax office daily CSV/XLSX files https://tax-office.traviscountytx.gov/pages/property.php | Parcel layer is geometry, refreshed monthly. No public bulk download of appraised values was found; TCAD would need to be asked. Apify listing actors for land comps are an option. |
| Cost (build) | **No source found.** | Idea (untested): median declared valuation per square foot of recent new-residential permits in the same council district, from dataset `3syk-w9eu`. Label it "permit-declared valuation"; declared values may not equal real cost. |

Known gaps to be honest about in the report:
- **Review times**: no official figure found. Reported numbers conflict: a KXAN report says average new-residential approval rose from 27 to 40 days (older year); the Austin Chronicle says average review time for all permits rose from 98 to 183 days (2021 to 2023); a third-party guide says 15 to 25 business days. Either compute it from permit data (if application dates exist) or show a range with sources. Do not present a single number.
- **Fees**: official DSD fee schedule not retrieved. A third-party guide estimates $3,000 to $15,000 total for an ADU **(unverified)**. Find the official schedule.

Austin context numbers (Pew, March 2026): housing stock grew about 30% (about 120,000 units) from 2015 to 2024 versus 9% nationally; median rent fell from $1,546 (Dec 2021) to $1,296 (Jan 2026).

---

## 7. Saving and reusing data (user requirement)

The user wants everything saved so it can be reused, and is unsure about cost. Design for three cache layers, so expensive steps run once:

1. **Sources**: raw fetched text or API response, URL, `retrieved_at`, `content_hash`. Fetch once; refetch only to refresh.
2. **Facts**: extracted claims with quote, `source_id`, verification status. **Extracted per source, not per parcel**, so the HOME rules for SF-3 are extracted once and reused by every SF-3 parcel. This is the biggest saving.
3. **Reports**: per parcel and idea, versioned, with scores, checklist and the fact ids used.

Invalidation: when a source's `content_hash` changes, mark dependent facts stale and rerun them. Store token usage (`response.usage`) for every Claude call so real cost is measured, not guessed.

Schema sketch (refine as needed):

```
parcels(id, address, lat, lng, council_district, zone_code, created_at)
sources(id, kind, url, retrieved_at, content_hash, raw_text, dataset_id)
facts(id, source_id, parcel_id null, specialist, claim, quote, quote_verified bool,
      data_query jsonb null, stale bool, created_at)
reports(id, parcel_id, idea, version, scores jsonb, summary, status, created_at)
report_facts(report_id, fact_id)
checklist_items(id, report_id, step_no, action, who_to_contact, fact_id)
runs(id, report_id, model, input_tokens, output_tokens, cost_usd_est, started_at, finished_at)
```

Cost of storing (estimates, unmeasured): facts and reports are small text rows, likely well under 1 GB even for thousands of parcels. Supabase Pro is $25/month and included an 8 GB database per project at the time of research **(third-party sources; verify)**; the free tier is smaller (believed to be 500 MB, **unverified**). Do not store whole zoning or flood polygon layers unless you need them for point-in-polygon; query the city APIs at run time and store only the result.

Cost of running (my estimates, unmeasured): roughly $0.25 to $0.50 per full parcel analysis with the model mix above, before web search. Reused sources and facts make repeat parcels cheaper. Overnight bulk refreshes could use the Batch API (50% discount). Measure with the `runs` table and replace these estimates with real numbers.

---

## 8. First tasks (do in order, 15 to 30 minutes each)

The goal is to prove every data path before building UI. Record each result (works / swapped / pending) in the `HACK.md` Status log.

1. **Permits dataset**: fetch https://data.austintexas.gov/api/views/3syk-w9eu.json and list the columns. Does it include an application date? Pull 10 recent new-residential permits.
2. **Zoning lookup**: pick the demo address (SF-3 lot by default, confirm with user). Geocode it, query the zoning layer by point, return the zone code.
3. **Rules extraction with quote check**: fetch the HOME amendments page, store the text, have Haiku extract the allowed number of units and key limits for that zone as structured output, then verify each quote verbatim in code. Report the pass rate.
4. **Flood check**: point-in-polygon against the floodplain dataset `neg3-2fup` for the same address.

Then: Supabase schema and storage, the four specialists, scoring formulas, the lead summary, the checklist, and finally the UI (parcel form, report with clickable citations, checklist).

Pass bar for the happy path: one real Austin address goes from input to a report where every claim shows its source, and the checklist names who to contact, all from stored data produced by the real pipeline.

---

## 9. Reference findings from the Constructa repo

Constructa (github.com/shubhaych/Constructa) is a hackathon project: TanStack Start, Hono API, Redis, Clerk, Browserbase, ASI:One, a Python FastAPI agent service. Worth copying: centralised key naming, env-guarded service clients, a thin API layer. Do not copy: its default outputs are seeded or hash-generated (scores are typed or derived from a hash), its mock "sources" are `example.gov` URLs, its voice log and watchdog are stubs, and its "6 specialist agents" are role-play prompts to a router with no check that any agent answered. Its Agentverse dispatcher pings agents to raise usage counters and discards the replies. We should not imitate any of that.

---

## 10. Open items to confirm with the user

- Event name and any tracks targeted.
- Final demo address and project idea (default above).
- Role split between the two teammates.
- Product name.
- How the pitch answers "how are you different from Spark, PermitPortal, AutoSitu, Permitify?" Suggested answer: they serve professionals; we serve first-timers, and every claim is verifiable.
- A sourced replacement for the unsourced "30%" statistic, or drop it.

---

## 11. Working agreements for this session

- Update the `HACK.md` Status log after each spike or milestone, with the time.
- Commit small and often; never commit `.env.local` or keys.
- If a source is unreachable or a result looks too good, say so plainly. Report failures with their output; do not paper over them.
- When something in this file turns out wrong, fix the file so the next session isn't misled.
