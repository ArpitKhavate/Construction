import { readRender } from "@/lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string }> };

export async function GET(_request: Request, context: Context) {
  const { name } = await context.params;
  const file = await readRender(name);
  if (!file) return new Response("Render not found.", { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
    },
  });
}
