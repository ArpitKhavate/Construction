import { constraintChips, parseConstraints } from "@/lib/constraints";
import { loadAnchorFacts } from "@/lib/gis";
import { rankSpots } from "@/lib/rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim() ?? "";
    if (prompt.length < 3) {
      return Response.json({ error: "Describe the building you want." }, { status: 400 });
    }
    const constraints = parseConstraints(prompt);
    const facts = await loadAnchorFacts();
    const spots = rankSpots(facts, constraints);
    return Response.json({ prompt, constraints, chips: constraintChips(constraints), spots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Austin maps could not be read.";
    return Response.json({ error: message }, { status: 502 });
  }
}
