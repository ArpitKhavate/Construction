import { reviseRun } from "@/lib/compose";
import { getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { feedback?: string };
    const current = await getRun(id);
    if (!current) return Response.json({ error: "Research run not found." }, { status: 404 });
    const next = await reviseRun(current, body.feedback ?? "");
    const saved = await updateRun(id, () => next);
    return Response.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The review could not be applied.";
    return Response.json({ error: message }, { status: 500 });
  }
}
