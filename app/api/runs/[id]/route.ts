import { getRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const run = await getRun(id);
  if (!run) return Response.json({ error: "Research run not found." }, { status: 404 });
  return Response.json(run);
}
