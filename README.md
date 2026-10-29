# Construction

**Know what you can build on an Austin lot before you buy it.**

First-time builders, such as someone adding a backyard home (ADU) or building a small fourplex, usually learn about zoning, floodplains and permit rules after they've already paid for something. Construction reads Austin's public city maps for a specific lot and explains what applies, in plain language with a source for every fact. It ends with a checklist of what to do next, draft emails and calls, and pre-filled permit forms.

## What it does

1. **Landing.** A 3D street with a finished house next to one under construction. One scroll flies the camera to a top-down view, which fades into a real satellite map of Austin.
2. **Find a lot.** There are two ways in:
   - **Describe it.** Type something like "4 homes in Austin, avoid the floodplain". The app ranks candidate spots across Austin neighborhoods by zoning and flood risk and shows them on the map.
   - **I have an address.** Type an address. The app matches it to its county parcel and researches that exact lot.
3. **Five research agents** read the city layers for the lot. They appear on screen as an animated crew:
   - **Zoney:** zoning and codes.
   - **Levee:** flood and hazards.
   - **Stamp:** permit history nearby.
   - **Foreman:** the filing path for the size of project.
   - **Fern:** creeks, trees and water quality.
4. **Results.**
   - A beginner checklist where each step says why it's there and links to the city source.
   - **Push back:** say "only 3 homes" or "avoid the floodplain" and the research is redone.
   - An aerial image of the lot with the building's footprint drawn on, for the AutoHDR track.
   - Pre-filled City of Austin permit forms to download.
   - An email and a phone call that are only sent or placed after you approve them.

## Stack

- Next.js 15 (App Router) with React 19 and TypeScript.
- Claude Haiku 5.5 (`claude-haiku-5-5`, Anthropic SDK): five agents run in parallel, one per research area.
- Apify (`compass/crawler-google-places`): local builder contacts from Google Maps.
- three.js through React Three Fiber and drei, for the street scene. It's built in code, with no model downloads.
- Agent characters: images generated in Figma, animated with CSS.
- MapLibre GL over Esri World Imagery for the satellite map.
- City of Austin ArcGIS REST layers, the US Census geocoder, and Travis Central Appraisal District (TCAD) parcels.
- `sharp` for the aerial image pipeline and `pdf-lib` for the permit PDFs.
- Resend or SMTP (nodemailer) for email, and Twilio for calls.
- Runs are stored in a local JSON file (`.data/runs.json`).

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add keys for email and calls
npm run dev                  # http://localhost:3000
```

Research works with no keys. With `ANTHROPIC_API_KEY`, the five agents write with Claude Haiku. Without it, each agent falls back to rule-written text built from the same facts. With `APIFY_API_TOKEN`, builder contacts are looked up live. Without it, a bundled list of real Austin builders is used. Email and calls need Resend, SMTP or Twilio keys. Without them, the drafts still appear and sending shows a clear error. See `.env.example`.

## What is live and what isn't

| Part | Status |
|---|---|
| Zoning, FEMA and city floodplains, nearby permits, wildfire area, pipeline buffer, airport overlay, creek buffer, historic districts | **Live.** Read from the City of Austin's ArcGIS layers for every run. |
| Address to parcel | **Live.** The Census geocoder finds the address, with Esri's World Geocoder as a fallback for misses and typos. It's then matched to the TCAD parcel with the same house number, or the nearest parcel inside the Austin zoning map. |
| Demo safety net | **Saved readings** for three demo addresses (3105 Cherrywood Rd, 1000 Barton Springs Rd in a floodplain, and 1500 S Lamar Blvd) in `lib/demo-cache.json`, plus the "Describe it" spots in `lib/anchor-facts-fallback.json`. Live data is always tried first. The saved reading is used only if the city servers fail, are too slow (9s), or answer with most layers missing. The agents and builders still run live. |
| Satellite map and aerial imagery | **Live.** Esri World Imagery tiles. |
| Candidate spots for "Describe it" | **Fixed set.** 16 points across Austin neighborhoods (`lib/anchors.ts`), each with a live zoning and flood reading that is cached for 6 hours. Not every parcel. |
| Agent write-ups (the text on each agent card) | **Live Claude Haiku 5.5**, one call per agent, in parallel (`lib/agents.ts`). Each agent sees only its slice of the live facts and must reply in a fixed JSON format. Source links come from code, not the model. If a call fails or times out (12s), that agent falls back to the rule-written text (`lib/report.ts`). |
| Checklist | **Written by rules** from the live facts and the current Austin Development Services process pages. |
| Builder contacts | **Live from Apify** (Google Maps, 5 builders within 8 km of the lot). Results are cached for 24 hours. If the lookup takes longer than 5 seconds, a bundled list of real Austin ADU and home builders, gathered with Apify, is shown while the lookup finishes in the background. |
| Aerial building footprint | **A diagram.** Real aerial tiles with tone and sharpening fixes. The roof outline is a drawn placeholder, not a design. |
| Permit forms | **Drafts filled from the research.** Nothing is submitted to the city. |
| Email and calls | **Real sends** once keys are set, only after you tick the approval box, and only to recipients listed in `DEMO_EMAIL`, `DEMO_PHONE` or `OUTREACH_ALLOW_TO`. |
| Sale prices and cost estimates | **Not included.** |

## Repo map

- `app/`: the pages (`/` landing and map, `/runs/[id]` results) and the API routes (`/api/recommend`, `/api/runs`, and per-run email, call, render, permits and revise).
- `components/`:
  - `Landing.tsx` and `StreetScene.tsx`: the landing page and its 3D street.
  - `MapDesk.tsx`: the map and its side panel.
  - `RunDesk.tsx`: the results page.
  - `Crew.tsx`: the animated agent characters.
  - `PermitSheets.tsx`: the permit forms.
- `lib/`:
  - `gis.ts`: the city layer reads.
  - `address.ts`: matching an address to its parcel.
  - `rank.ts`: scoring the candidate spots.
  - `agents.ts`: the five Haiku agents.
  - `builders.ts`: the Apify builder lookup, with a bundled fallback list in `builders-fallback.json`.
  - `report.ts`: the agent write-ups, checklist and outreach drafts.
  - `compose.ts`: builds and revises a run.
  - `render.ts`: the aerial image.
  - `permitPacket.ts`: the permit form contents.
- `app/theme.css`: the visual theme, layered over `globals.css`.

## Team

Arpit Khavate and Fawaz, for the AutoHDR and Antler tracks.
