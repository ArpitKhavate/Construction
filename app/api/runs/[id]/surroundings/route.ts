import { getRun } from "@/lib/store";
import { surroundings } from "@/lib/surroundings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const run = await getRun(id);
    if (!run) return Response.json({ error: "Research run not found." }, { status: 404 });
    return Response.json(await surroundings(run.spot, run.render?.before ?? null));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The neighborhood could not be loaded.";
    return Response.json({ error: message }, { status: 502 });
  }
}
