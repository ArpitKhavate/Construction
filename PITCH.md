# Pitch: Construction

Judging: Fri 2026-10-30, 13:00–16:00, at a table with Q&A, repeated for three hours. Criteria: Application, Functionality/Quality, Creativity, Technical Complexity. Tracks: AutoHDR and Antler.

## Before each judge sits down

- The app is open on the landing page, in a full-screen browser on the laptop, so the 3D runs on the graphics card.
- The address tab already has **3105 Cherrywood Rd** and "A backyard ADU (small second home) to rent out" filled in.
- A finished results page is open in a second tab as a backup, in case the city's map servers are slow.

## 2-minute demo script

**0:00–0:20: The problem (one speaker, facing the judge)**
> "Most people building for the first time find out what their lot allows after they've paid for it. In one industry survey, 75% of project owners went over budget and 77% finished late, across all sectors. In Austin, the answers are public, but they're split across a dozen city maps and process pages. Construction reads all of them for your exact lot."

**0:20–0:40: Landing to map (the other speaker drives)**
- Scroll once. The camera flies up over the street and lands looking straight down, and the real satellite map of Austin fades in.
> "This is the same neighborhood, now on a live map of Austin."

**0:40–1:15: The crew at work**
- Click **I have an address**, then **Research this address**.
> "Five agents, one for each part of the city's rules: zoning, flood, permits, the filing path, and environment. These are real city map layers being read right now, not a template."
- The results page opens and the crew reports one by one. Point at the lines:
  - **Zoney:** "Zoned SF-3-NP"
  - **Levee:** "No flood zone". If there's a hit, Levee's umbrella pops open.
  - **Stamp:** "4 permits nearby"

**1:15–1:40: What you do next**
- Scroll to the checklist and open one "Why this is on the list".
> "Every step says why it's there and links to the city page it came from."
- Click **Fill the permits** to show the pre-filled City of Austin forms.

**1:40–2:00: Push back, then close**
- Type "Only 3 homes" and click **Revise the research**. The checklist rewrites itself.
> "You can argue with it, and it shows you what changed. Next we'd connect licensed builders and the city's own permit system. It's built for the person who has one lot and one shot."

## Talking points by track

- **AutoHDR:** the aerial image pipeline (`lib/render.ts`) stitches the city aerial for the lot, fixes tone and color, sharpens it, and draws the building's footprint on it. There's a before/after slider on the results page.
- **Antler** (is this a company?):
  - The buyer is the first-time builder, and the same flow works for small developers screening lots.
  - Possible paid tiers: a "full permit packet" product, and referral fees from builders and surveyors.
  - Austin first. Every city publishes the same kinds of map layers, so the agent pattern carries over.

## Likely judge questions

- **"Are the agents real AI or templates?"**
  - The facts are always live from the city's map layers.
  - On this branch, the agent text is written by rules from those facts. The `real-agents` branch has each agent as a Claude Haiku call that is limited to the facts it's given, and falls back to the rule-written text if a call fails.
  - Say which version you're demoing.
- **"How do you know it's right?"** Every finding links to the city layer or page it came from. The app says plainly when a layer didn't answer, and the checklist tells you to confirm the exact lot with the city and a surveyor. It is research, not a zoning determination.
- **"Does it work for any address?"** Any address in Austin's zoning map works. Outside Austin, it says so and stops.
- **"Where does the data come from?"**
  - City of Austin ArcGIS layers: zoning, FEMA and city floodplains, building permits, wildfire area, pipelines, airport overlay, creeks, historic districts.
  - Census geocoder and Travis County appraisal district parcels.
  - Esri imagery.
- **"What's mocked?"**
  - The building footprint on the aerial is a diagram.
  - The permit forms are drafts, and nothing is submitted.
  - The "Describe it" search ranks 16 neighborhood points, not every parcel.
  - There are no prices.
- **"Why the characters?"** Agents are usually invisible ("thinking…"). Showing each one working and reporting builds trust, and makes a 6-second wait part of the demo.
- **"What's hard technically?"**
  - Live queries to about 10 city layers in parallel.
  - Matching an address to its parcel, because Census points land on the street center line and miss the zoning shape.
  - A camera flight that hands off from the 3D street to a real map.
  - Characters built entirely in code, with no model files.
- **"What would you build next?"** Real lot measurements (setbacks and how much can be built), cost estimates, live builder contacts (on the `apify-builders` branch), and submitting to the city's permit system.

## Roles

- **Speaker:** the problem and the close, and handles questions.
- **Driver:** runs the laptop, and narrates the crew and the checklist.
- Swap every few judges.

## If something breaks

- **City layers are slow:** switch to the backup results tab and say "this is a run from five minutes ago, same live data."
- **3D is slow on the judging laptop:** start from the backup tab. The results page carries the demo on its own.
