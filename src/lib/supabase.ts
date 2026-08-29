import { createClient } from "@supabase/supabase-js";

// Server-side client - uses the service role key, never expose this to the browser.
// Used for reading/writing OAuth tokens and session data tied to your account.
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in your .env file."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
