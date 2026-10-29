import { createClient } from "@supabase/supabase-js";

// Read-only client for server components. Uses the public key; RLS allows select only.
export function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
