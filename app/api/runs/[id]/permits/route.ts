import { buildPermitPacket } from "@/lib/permitPacket";
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
    const permitsPacket = buildPermitPacket(current);
    const saved = await updateRun(id, (run) => ({ ...run, permitsPacket }));
    if (!saved) return Response.json({ error: "Research run not found." }, { status: 404 });
    return Response.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The permits could not be filled.";
    return Response.json({ error: message }, { status: 502 });
  }
}
