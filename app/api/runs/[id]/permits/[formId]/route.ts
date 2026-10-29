import { renderPermitPdf } from "@/lib/permitPdf";
import { getRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; formId: string }> };

export async function GET(_request: Request, context: Context) {
  const { id, formId } = await context.params;
  const run = await getRun(id);
  const form = run?.permitsPacket?.forms.find((item) => item.id === formId);
  if (!run || !form) {
    return Response.json({ error: "Fill the permits before downloading." }, { status: 404 });
  }
  const bytes = await renderPermitPdf(form);
  const fileName = form.fileName.replace(/[^a-z0-9.-]+/gi, "-");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
