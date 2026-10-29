import { applyFeedback, constraintsChanged, parseConstraints } from "@/lib/constraints";
import { readAddress } from "@/lib/address";
import { cachedDemo, degraded } from "@/lib/demo-cache";
import { builderSearch, findBuilders, withBuilderEmail, withBuilderItem } from "@/lib/builders";
import { loadAnchorFacts, readField } from "@/lib/gis";
import { annotateSpot, rankSpots } from "@/lib/rank";
import { runAgents } from "@/lib/agents";
import { buildCall, buildChecklist, buildEmail } from "@/lib/report";
import type { Constraints, FieldReport, RunRecord, Spot } from "@/lib/types";

// How long a demo address waits for live city data before using its saved reading.
const LIVE_BUDGET_MS = 9000;

export async function buildRun(input: {
  prompt: string;
  constraints: Constraints;
  spot: Spot;
  id?: string;
  createdAt?: string;
  feedback?: string[];
  revision?: RunRecord["revision"];
  builders?: RunRecord["builders"];
  field?: FieldReport;
  fieldMs?: number;
}): Promise<RunRecord> {
  // Builders load beside the GIS read and are capped so they never hold the run up.
  const buildersJob = input.builders
    ? Promise.resolve(input.builders)
    : findBuilders(input.constraints, input.spot).then((found) => found.builders);
  const started = Date.now();
  const field = input.field ?? (await readField(input.spot));
  const elapsed = input.fieldMs ?? Date.now() - started;
  const steps = await runAgents(input.spot, field, input.constraints, { prompt: input.prompt, fallbackMs: elapsed });
  const now = new Date().toISOString();
  const builders = await buildersJob;
  return {
    id: input.id ?? crypto.randomUUID(),
    prompt: input.prompt,
    constraints: input.constraints,
    spot: input.spot,
    field,
    steps,
    checklist: withBuilderItem(buildChecklist(input.constraints, field), builders),
    email: withBuilderEmail(buildEmail(input.spot, field, input.constraints), builders),
    builders,
    call: buildCall(input.spot, field, input.constraints),
    render: null,
    permitsPacket: null,
    revision: input.revision ?? null,
    feedback: input.feedback ?? [],
    durationMs: elapsed,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

export async function researchSpot(prompt: string, spotId: string) {
  const constraints = parseConstraints(prompt);
  const facts = await loadAnchorFacts();
  const fact = facts.find((item) => item.id === spotId);
  if (!fact) throw new Error("That spot is not in the current Austin set. Search again and pick a thought bubble.");
  const spot = annotateSpot(fact, constraints);
  return buildRun({ prompt, constraints, spot });
}

export async function researchAddress(prompt: string, address: string) {
  const constraints = parseConstraints(prompt);
  const demo = cachedDemo(address);
  if (!demo) {
    const fact = await readAddress(address);
    return buildRun({ prompt, constraints, spot: annotateSpot(fact, constraints) });
  }
  const liveStart = Date.now();
  // Demo addresses try live first, then fall back to the saved reading if the city servers are slow or down.
  const live = (async () => {
    const fact = await readAddress(address);
    return { fact, field: await readField(fact) };
  })().catch(() => null);
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), LIVE_BUDGET_MS));
  const got = await Promise.race([live, late]);
  const use = got && !degraded(got.field) ? got : demo;
  if (use === demo) console.warn(`[demo-cache] using the saved city reading for ${address}`);
  return buildRun({ prompt, constraints, spot: annotateSpot(use.fact, constraints), field: use.field, fieldMs: Date.now() - liveStart });
}

export async function reviseRun(run: RunRecord, feedback: string) {
  const text = feedback.trim();
  if (text.length < 2) throw new Error("Tell the agents what to change.");
  const constraints = applyFeedback(run.constraints, text);
  const changed = constraintsChanged(run.constraints, constraints);
  if (!changed) {
    return {
      ...run,
      feedback: [...run.feedback, text],
      revision: {
        note: `Feedback noted: "${text}". The unit count, flood preference, and building type did not change, so the spot and the checklist stay put. Try "avoid the floodplain" or "only 3 homes".`,
        fromName: run.spot.name,
        toName: run.spot.name,
        moved: false,
      },
      updatedAt: new Date().toISOString(),
    };
  }
  const facts = await loadAnchorFacts();
  const ranked = rankSpots(facts, constraints);
  // Address runs are not in the anchor set, so they re-score against the spot they already have.
  const current = run.spot.id.startsWith("addr-") ? run.spot : facts.find((item) => item.id === run.spot.id);
  const rescored = current ? annotateSpot(current, constraints) : null;
  const stayed = Boolean(rescored && rescored.band !== "weak");
  const pick = stayed ? current : facts.find((item) => item.id === ranked[0]?.id);
  if (!pick) throw new Error("Austin spots could not be ranked again.");
  const spot = annotateSpot(pick, constraints);
  const note = stayed
    ? `${spot.name} still fits after "${text}". The checklist was rewritten for the new request.`
    : `${run.spot.name} dropped off the shortlist. ${rescored?.caution ?? "It no longer matches the request."} ${spot.name} is the new recommendation.`;
  const next = await buildRun({
    prompt: run.prompt,
    constraints,
    spot,
    id: run.id,
    createdAt: run.createdAt,
    feedback: [...run.feedback, text],
    revision: {
      note,
      fromName: run.spot.name,
      toName: spot.name,
      moved: !stayed,
    },
    builders:
      run.spot.id === spot.id && builderSearch(run.constraints) === builderSearch(constraints) ? run.builders : undefined,
    field: run.spot.id === spot.id ? run.field : undefined,
  });
  if (run.email.status === "sent") next.email = run.email;
  if (run.call.status === "placed") next.call = run.call;
  if (run.render && run.spot.id === next.spot.id) next.render = run.render;
  return next;
}
