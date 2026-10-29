import { researchAddress, researchSpot } from "@/lib/compose";
import { createRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string; spotId?: string; address?: string };
    const prompt = body.prompt?.trim() ?? "";
    const spotId = body.spotId?.trim() ?? "";
    const address = body.address?.trim() ?? "";
    if (address) {
      if (prompt.length < 3) return Response.json({ error: "Describe what you want to build." }, { status: 400 });
      const run = await researchAddress(prompt, address);
      await createRun(run);
      return Response.json(run);
    }
    if (prompt.length < 3 || !spotId) {
      return Response.json({ error: "Choose a spot and describe the building." }, { status: 400 });
    }
    const run = await researchSpot(prompt, spotId);
    await createRun(run);
    return Response.json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research could not finish.";
    return Response.json({ error: message }, { status: 500 });
  }
}
