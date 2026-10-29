"use server";

import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Looks up a stored report for the address. The live pipeline is not wired yet,
// so unknown addresses come back to the form with a message.
export async function findReport(formData: FormData) {
  const address = String(formData.get("address") ?? "").trim();
  const idea = String(formData.get("idea") ?? "").trim();
  if (!address) redirect("/start?error=Enter an address");

  const street = address.split(",")[0].trim();
  const { data: parcel } = await supabase()
    .from("parcels")
    .select("id")
    .ilike("address", `${street}%`)
    .limit(1)
    .maybeSingle();

  if (parcel) {
    const { data: report } = await supabase()
      .from("reports")
      .select("id")
      .eq("parcel_id", parcel.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (report) redirect(`/report/${report.id}`);
  }

  const q = new URLSearchParams({
    error: "We haven't analyzed that parcel yet. Try one of the parcels below.",
    address,
    idea,
  });
  redirect(`/start?${q}`);
}
