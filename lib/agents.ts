import Anthropic from "@anthropic-ai/sdk";
import { placeLabel } from "@/lib/gis";
import { buildSteps } from "@/lib/report";
import type { AgentId, AgentStep, Constraints, FieldReport, Spot } from "@/lib/types";

const MODEL = "claude-haiku-5-5";
const AGENT_TIMEOUT_MS = 12_000;
// All five run in parallel, so the whole research pass waits at most this long on the model.
const RUN_BUDGET_MS = 14_000;

const ROLES: Record<AgentId, string> = {
  codes:
    "You are the Codes agent. You read the zoning district returned by the City of Austin zoning layer and explain what each zoning token means for someone who wants to build.",
  hazards:
    "You are the Hazards agent. You read the flood, hazardous-pipeline, airport-overlay and wildland-urban-interface layer checks and explain what they mean for building on this spot.",
  permits:
    "You are the Permits agent. You read the building permits filed near this spot and explain what that nearby permit history suggests about building here.",
  development:
    "You are the Development help agent. You explain which City of Austin filing path fits the requested unit count and building type, and what the builder should do first.",
  environmental:
    "You are the Environmental agent. You read the creek and floodplain checks and explain what they mean for erosion, trees and water quality review on this spot.",
};

const SYSTEM = `You are one member of a small research crew that helps first-time builders understand a lot in Austin, Texas.

Rules:
- Ground every statement in the FACTS JSON you are given. Do not invent numbers, distances, dates, ordinance sections, fees or rules that are not in the facts.
- "cityNotes" are vetted sentences from the city's own pages and the map reading. You may rephrase them, but keep their meaning and any numbers exactly.
- A layer state of "hit" means the map point intersects that layer, "clear" means it does not, and "unknown" means the layer did not answer. Say plainly when something is unknown.
- Write in plain language for someone who has never built before. Short sentences, no jargon without a quick explanation.
- This is map research, not a zoning determination or legal advice. Do not promise that anything is allowed.
- Stay on your own topic. Other crew members cover the other topics, so do not comment on facts you were not given.
- Do not spend a bullet on a generic disclaimer unless the cityNotes contain one.

Reply with only a JSON object: {"summary": string, "bullets": string[]}.
"summary" is one sentence of at most 30 words. "bullets" has 2 to 4 items, each at most 40 words.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "bullets"],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ maxRetries: 0, timeout: AGENT_TIMEOUT_MS });
  return client;
}

function factsFor(id: AgentId, spot: Spot, field: FieldReport, constraints: Constraints, template: AgentStep) {
  const place = placeLabel(field.address, spot.name);
  const request = {
    units: constraints.units,
    kind: constraints.kind,
    fourplex: constraints.fourplex,
    adu: constraints.adu,
    avoidFlood: constraints.avoidFlood,
    budget: constraints.budget,
  };
  const cityNotes = [template.summary, ...template.bullets];
  switch (id) {
    case "codes":
      return { place, zoning: field.zoning, zoningBase: field.zoningBase, historic: field.historic, request, cityNotes };
    case "hazards":
      return {
        place,
        femaFloodZone: field.fema,
        cityFloodplain: field.coaFlood,
        femaWithin100ft: field.nearFlood,
        hazardousPipelineWithin200ft: field.pipeline,
        wildlandUrbanInterface: field.wui,
        airportOverlay: field.airport,
        request,
        cityNotes,
      };
    case "permits":
      return { place, searchRadius: "about 220 meters", permits: field.permits, request, cityNotes };
    case "development":
      return {
        place,
        zoning: field.zoning,
        zoningBase: field.zoningBase,
        femaFloodZone: field.fema,
        cityFloodplain: field.coaFlood,
        request,
        notes: constraints.notes,
        cityNotes,
      };
    case "environmental":
      return {
        place,
        creekCenterlineWithin100ft: field.creek,
        femaFloodZone: field.fema,
        cityFloodplain: field.coaFlood,
        femaWithin100ft: field.nearFlood,
        notInThisPass: ["protected trees", "critical water quality zones"],
        request,
        cityNotes,
      };
  }
}

function parseReply(text: string): { summary: string; bullets: string[] } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { summary, bullets } = data as { summary?: unknown; bullets?: unknown };
  if (typeof summary !== "string" || !summary.trim() || !Array.isArray(bullets)) return null;
  const clean = bullets
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (clean.length < 2) return null;
  return { summary: summary.trim(), bullets: clean };
}

async function askAgent(
  api: Anthropic,
  template: AgentStep,
  facts: unknown,
  prompt: string,
  signal: AbortSignal,
) {
  const response = await api.messages.create(
    {
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: `${SYSTEM}\n\n${ROLES[template.id]}`,
      messages: [
        {
          role: "user",
          content: `The builder asked: ${JSON.stringify(prompt || "(no prompt given)")}\n\nFACTS:\n${JSON.stringify(facts, null, 2)}`,
        },
      ],
    },
    { signal, timeout: AGENT_TIMEOUT_MS },
  );
  if (response.stop_reason !== "end_turn") throw new Error(`stop_reason ${response.stop_reason}`);
  const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  const parsed = parseReply(text);
  if (!parsed) throw new Error("reply was not the expected JSON");
  return parsed;
}

// Runs the five research agents on Claude in parallel. Any agent that fails falls back to its template step,
// so the run never breaks. Sources and status always come from the template, so links stay real.
export async function runAgents(
  spot: Spot,
  field: FieldReport,
  constraints: Constraints,
  options: { prompt?: string; fallbackMs?: number } = {},
): Promise<AgentStep[]> {
  const fallbackMs = options.fallbackMs ?? 0;
  const templates = buildSteps(spot, field, constraints, {
    codes: fallbackMs,
    hazards: fallbackMs,
    permits: fallbackMs,
    development: fallbackMs,
    environmental: fallbackMs,
  });
  const api = getClient();
  if (!api) return templates;

  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), RUN_BUDGET_MS);
  try {
    return await Promise.all(
      templates.map(async (template) => {
        const started = Date.now();
        try {
          const facts = factsFor(template.id, spot, field, constraints, template);
          const reply = await askAgent(api, template, facts, options.prompt ?? "", budget.signal);
          return { ...template, summary: reply.summary, bullets: reply.bullets, durationMs: Date.now() - started };
        } catch (error) {
          const reason = error instanceof Anthropic.APIError ? `${error.constructor.name} ${error.status ?? ""}` : String(error);
          console.warn(`[agents] ${template.id} fell back to template: ${reason}`);
          return template;
        }
      }),
    );
  } finally {
    clearTimeout(timer);
  }
}
