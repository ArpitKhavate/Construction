import { normalizePhone, placeCall } from "@/lib/outreach";
import { getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const current = await getRun(id);
  if (!current) return Response.json({ error: "Research run not found." }, { status: 404 });
  const body = (await request.json()) as { to?: string; script?: string; approved?: boolean };
  if (body.approved !== true) {
    return Response.json({ error: "Confirm the phone number on screen before the call is placed." }, { status: 400 });
  }
  const to = normalizePhone(body.to ?? "");
  const script = body.script?.trim() || current.call.script;
  if (!to) return Response.json({ error: "Enter a phone number, including area code." }, { status: 400 });
  if (script.length < 10) return Response.json({ error: "The call script is empty." }, { status: 400 });

  try {
    const result = await placeCall({ to, script });
    const saved = await updateRun(id, (run) => ({
      ...run,
      call: { to, script, status: "placed", providerId: result.providerId },
    }));
    return Response.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The call could not be placed.";
    const saved = await updateRun(id, (run) => ({
      ...run,
      call: { to, script, status: "failed", error: message },
    }));
    return Response.json(saved ?? { error: message }, { status: 502 });
  }
}
