import { createClient } from "@supabase/supabase-js";

// Public values, baked in at build time (Vite). The anon / publishable key is safe in the bundle:
// what a signed-in person may do is decided by our API (token check + allowlist), not by this key.
const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const authConfigured = Boolean(url && anonKey);
if (!authConfigured) {
  console.warn("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set: sign-in will not work.");
}

// createClient throws on an empty URL or key; placeholders keep the auth screen renderable.
export const supabase = createClient(url || "https://example.invalid", anonKey || "missing-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
