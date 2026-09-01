import { getSupabaseServerClient } from "@/lib/supabase";

// Each provider has very different free-tier quotas. We enforce our own
// lower ceiling per provider so CeeBee degrades gracefully with a friendly
// message instead of hammering into the real limit and erroring out.
const INTERNAL_RPM_LIMITS: Record<string, number> = {
  gemini: 15, // Google's actual free-tier RPM varies by model/project; stay well under it
  groq: 25, // openai/gpt-oss-120b allows 30 RPM (confirmed on Shina's account)
};

export async function checkRateLimit(provider: "gemini" | "groq"): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const limit = INTERNAL_RPM_LIMITS[provider] ?? 10;

  const { count } = await supabase
    .from("rate_limit_hits")
    .select("*", { count: "exact", head: true })
    .eq("provider", provider)
    .gte("created_at", oneMinuteAgo);

  if ((count ?? 0) >= limit) {
    return false;
  }

  await supabase.from("rate_limit_hits").insert({ provider });

  const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
  await supabase.from("rate_limit_hits").delete().lt("created_at", twoMinutesAgo);

  return true;
}
