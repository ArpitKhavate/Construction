import { designBoard } from "@/lib/design";
import { getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const current = await getRun(id);
    if (!current) return Response.json({ error: "Research run not found." }, { status: 404 });
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    const design = await designBoard(current.spot, fresh);
    const saved = await updateRun(id, (run) => ({ ...run, design }));
    return Response.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The design photos could not be scraped.";
    return Response.json({ error: message }, { status: 502 });
  }
}
