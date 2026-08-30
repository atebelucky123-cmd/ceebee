import { getSupabaseServerClient } from "@/lib/supabase";

// Gemini's free tier caps at 20 requests/minute (project-wide). We enforce
// our own lower ceiling so CeeBee degrades gracefully with a friendly
// message instead of hammering into Google's actual limit and erroring out.
const INTERNAL_RPM_LIMIT = 15;

// Returns true if it's safe to make a Gemini request right now. Also
// records this attempt and opportunistically cleans up old rows so the
// table doesn't grow unbounded.
export async function checkRateLimit(): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

  const { count } = await supabase
    .from("rate_limit_hits")
    .select("*", { count: "exact", head: true })
    .gte("created_at", oneMinuteAgo);

  if ((count ?? 0) >= INTERNAL_RPM_LIMIT) {
    return false;
  }

  await supabase.from("rate_limit_hits").insert({});

  // Clean up anything older than 2 minutes so this table stays tiny.
  const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
  await supabase.from("rate_limit_hits").delete().lt("created_at", twoMinutesAgo);

  return true;
}
