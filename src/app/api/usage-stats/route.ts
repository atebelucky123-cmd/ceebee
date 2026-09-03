import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { AVAILABLE_MODELS, providerForModel } from "@/lib/settings";

// Each provider resets its free-tier daily quota at a different moment in
// UTC, not at Shina's local midnight -- so "today's usage" needs a boundary
// per provider, not one shared server-local midnight. Gemini's free tier
// resets at midnight Pacific Time; Groq's daily limits reset at UTC
// midnight. (Groq doesn't publish an exact reset timezone as clearly as
// Gemini does -- UTC is the documented convention for its rolling/day
// windows, so it's used here as the best-supported default. If the numbers
// still look off against Groq's own dashboard, this is the line to revisit.)
const RESET_TIMEZONE: Record<"gemini" | "groq", string> = {
  gemini: "America/Los_Angeles",
  groq: "UTC",
};

// Returns the most recent local midnight in `timeZone`, as a real UTC
// Date -- i.e. "today" starts wherever that provider's clock says it does,
// not wherever this server's process clock happens to be.
function startOfDayInTimeZone(timeZone: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;

  // Midnight of that date, expressed in that timezone -- found by taking a
  // UTC guess at that date/time, then correcting for that timezone's actual
  // offset at that moment (handles DST without a timezone library).
  const utcGuess = new Date(`${y}-${m}-${d}T00:00:00Z`);
  const asTz = new Date(utcGuess.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(utcGuess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = asTz.getTime() - asUtc.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

export async function GET() {
  const supabase = getSupabaseServerClient();

  const sinceByProvider: Record<"gemini" | "groq", Date> = {
    gemini: startOfDayInTimeZone(RESET_TIMEZONE.gemini),
    groq: startOfDayInTimeZone(RESET_TIMEZONE.groq),
  };
  const earliest =
    sinceByProvider.gemini < sinceByProvider.groq ? sinceByProvider.gemini : sinceByProvider.groq;

  const { data, error } = await supabase
    .from("usage_logs")
    .select("*")
    .gte("created_at", earliest.toISOString())
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  function summarize(modelId: string) {
    const boundary = sinceByProvider[providerForModel(modelId) as "gemini" | "groq"];
    const modelRows = rows.filter(
      (r) => r.model === modelId && new Date(r.created_at) >= boundary
    );
    const totalRequests = modelRows.length;
    const totalPromptTokens = modelRows.reduce((s, r) => s + (r.prompt_tokens ?? 0), 0);
    const totalOutputTokens = modelRows.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
    const totalToolCalls = modelRows.reduce((s, r) => s + (r.tool_calls ?? 0), 0);
    const avgLatency =
      modelRows.length > 0
        ? Math.round(modelRows.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / modelRows.length)
        : 0;
    return { totalRequests, totalPromptTokens, totalOutputTokens, totalToolCalls, avgLatencyMs: avgLatency };
  }

  const byModel = Object.fromEntries(
    AVAILABLE_MODELS.map((m) => [m.id, { label: m.label, ...summarize(m.id) }])
  );

  return NextResponse.json({
    byModel,
    recent: rows.slice(0, 20),
  });
}
