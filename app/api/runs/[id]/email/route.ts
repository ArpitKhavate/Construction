import { normalizeEmail, sendEmail } from "@/lib/outreach";
import { getRun, updateRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    to?: string;
    subject?: string;
    body?: string;
    approved?: boolean;
  };
  if (body.approved !== true) {
    return Response.json({ error: "Approve the email on screen before it is sent." }, { status: 400 });
  }
  const to = normalizeEmail(body.to ?? "");
  const subject = body.subject?.trim() ?? "";
  const text = body.body?.trim() ?? "";
  if (!to) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (subject.length < 3 || text.length < 10) {
    return Response.json({ error: "The subject and the message both need text." }, { status: 400 });
  }
  const current = await getRun(id);
  if (!current) return Response.json({ error: "Research run not found." }, { status: 404 });

  try {
    const result = await sendEmail({ to, subject, body: text });
    const saved = await updateRun(id, (run) => ({
      ...run,
      email: { to, subject, body: text, status: "sent", providerId: result.providerId },
    }));
    if (!saved) return Response.json({ error: "Research run not found." }, { status: 404 });
    return Response.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The email could not be sent.";
    const saved = await updateRun(id, (run) => ({
      ...run,
      email: { to, subject, body: text, status: "failed", error: message },
    }));
    return Response.json(saved ?? { error: message }, { status: 502 });
  }
}
