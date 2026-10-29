import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Report } from "@/lib/types";

export const dynamic = "force-dynamic";

const SCORE_LABELS: Record<string, string> = {
  overall: "Overall",
  zoning: "Zoning",
  permits: "Permits",
  hazards: "Hazards",
  cost: "Cost",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabase()
    .from("reports")
    .select("*, parcels(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const report = data as Report;
  const parcel = report.parcels;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-gray-600 hover:underline">
        ← New search
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">{parcel?.address}</h1>
      <p className="mt-1 text-gray-600">{report.idea}</p>
      <p className="mt-1 text-sm text-gray-500">
        Zoning {parcel?.zone_code ?? "unknown"}
        {parcel?.lot_sqft ? ` · Lot about ${Math.round(parcel.lot_sqft).toLocaleString()} sq ft` : ""}
      </p>

      {report.scores && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Object.entries(report.scores).map(([k, v]) => (
            <div key={k} className="rounded border border-gray-200 p-3 text-center">
              <div className="text-2xl font-semibold">{v}</div>
              <div className="text-xs text-gray-600">{SCORE_LABELS[k] ?? k}</div>
            </div>
          ))}
        </div>
      )}

      {report.summary && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Summary</h2>
          <p className="mt-2 leading-relaxed">{report.summary}</p>
        </section>
      )}

      {report.sections?.map((s) => (
        <section key={s.key} className="mt-8">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <ul className="mt-2 space-y-3">
            {s.findings.map((f, i) => (
              <li key={i} className="border-l-2 border-gray-300 pl-3">
                <p>{f.claim}</p>
                {f.quote && <p className="mt-1 text-sm italic text-gray-600">“{f.quote}”</p>}
                <p className="mt-1 text-xs text-gray-500">
                  <a href={f.source_url} target="_blank" rel="noreferrer" className="underline">
                    {f.source_title}
                  </a>{" "}
                  · as of {formatDate(f.retrieved_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {report.checklist && report.checklist.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Your next steps</h2>
          <ol className="mt-2 space-y-3">
            {report.checklist.map((c) => (
              <li key={c.step} className="rounded border border-gray-200 p-3">
                <div className="font-medium">
                  {c.step}. {c.action}
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  Contact: {c.who}
                  {c.phone && ` · ${c.phone}`}
                  {c.email && ` · ${c.email}`}
                  {c.url && (
                    <>
                      {" · "}
                      <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                        website
                      </a>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {report.contacts && report.contacts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Local pros who build ADUs</h2>
          <ul className="mt-2 divide-y divide-gray-200 border-y border-gray-200">
            {report.contacts.map((c, i) => (
              <li key={i} className="py-3">
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-gray-600">
                  {[c.category, c.rating && `${c.rating}★ (${c.reviews ?? 0})`, c.phone]
                    .filter(Boolean)
                    .join(" · ")}
                  {c.website && (
                    <>
                      {" · "}
                      <a href={c.website} target="_blank" rel="noreferrer" className="underline">
                        website
                      </a>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-12 text-xs text-gray-500">
        This is research, not a zoning determination. Confirm with the City of Austin
        Development Services Department before you apply.
      </p>
    </main>
  );
}
