import { envPresence, supabaseStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return Response.json({
    ok: true,
    env: envPresence(),
    supabase: await supabaseStatus(),
  });
}
