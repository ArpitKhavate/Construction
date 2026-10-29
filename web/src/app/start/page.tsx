import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { findReport } from "../actions";
import type { Report } from "@/lib/types";
import SubmitButton from "./SubmitButton";

export const dynamic = "force-dynamic";

export default async function Start({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; address?: string; idea?: string }>;
}) {
  const { error, address, idea } = await searchParams;
  const { data } = await supabase()
    .from("reports")
    .select("id, idea, created_at, parcels(address, zone_code)")
    .order("created_at", { ascending: false })
    .limit(10);
  const reports = (data ?? []) as unknown as Report[];

  return (
    <main className="relative min-h-dvh bg-trace px-5 py-8 md:py-12">
      <div className="pointer-events-none absolute inset-3 border border-graphite/40 md:inset-5" />
      <div className="relative mx-auto max-w-2xl">
        <Link href="/" className="display text-xl font-bold uppercase tracking-wide">
          Construction
        </Link>

        <h1 className="display mt-10 text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.95] font-extrabold">
          Tell us about your lot
        </h1>

        <form action={findReport} className="mt-8 border border-graphite/60 bg-paper/80">
          <label className="grid border-b border-graphite/40 sm:grid-cols-[9rem_1fr]">
            <span className="px-3 pt-3 text-sm text-graphite-soft sm:border-r sm:border-graphite/40 sm:py-4">
              Address
            </span>
            <input
              name="address"
              defaultValue={address ?? "3105 Cherrywood Rd, Austin, TX 78722"}
              required
              className="bg-transparent px-3 pt-1 pb-3 text-lg font-medium outline-none focus-visible:bg-white/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-graphite sm:py-4"
            />
          </label>
          <label className="grid border-b border-graphite/40 sm:grid-cols-[9rem_1fr]">
            <span className="px-3 pt-3 text-sm text-graphite-soft sm:border-r sm:border-graphite/40 sm:py-4">
              What you want to build
            </span>
            <input
              name="idea"
              defaultValue={idea ?? "A backyard ADU (small second home) to rent out"}
              className="bg-transparent px-3 pt-1 pb-3 text-lg font-medium outline-none focus-visible:bg-white/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-graphite sm:py-4"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <p className="text-sm text-graphite-soft">Austin, Texas only for now.</p>
            <SubmitButton />
          </div>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red">
            {error}
          </p>
        )}

        <h2 className="display mt-14 text-2xl font-bold">Lots we&apos;ve already drawn up</h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-graphite-soft">None yet.</p>
        ) : (
          <ul className="mt-3 border-t border-graphite/40">
            {reports.map((r) => (
              <li key={r.id} className="border-b border-graphite/40">
                <Link
                  href={`/report/${r.id}`}
                  className="flex items-baseline justify-between gap-4 py-3 transition-colors hover:text-red"
                >
                  <span>
                    <span className="block font-semibold">{r.parcels?.address}</span>
                    <span className="block text-sm text-graphite-soft">{r.idea}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium">{r.parcels?.zone_code}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
