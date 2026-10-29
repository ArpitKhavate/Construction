import { renderSpot } from "@/lib/render";
import { getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const current = await getRun(id);
    if (!current) return Response.json({ error: "Research run not found." }, { status: 404 });
    const render = await renderSpot(id, current.spot.lng, current.spot.lat, current.constraints.units ?? 2);
    const saved = await updateRun(id, (run) => ({ ...run, render }));
    return Response.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The aerial could not be rendered.";
    return Response.json({ error: message }, { status: 502 });
  }
}
