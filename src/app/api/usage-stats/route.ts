import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("usage_logs")
    .select("*")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const totalRequests = rows.length;
  const totalPromptTokens = rows.reduce((s, r) => s + (r.prompt_tokens ?? 0), 0);
  const totalOutputTokens = rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
  const totalToolCalls = rows.reduce((s, r) => s + (r.tool_calls ?? 0), 0);
  const avgLatency =
    rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / rows.length)
      : 0;

  return NextResponse.json({
    today: {
      totalRequests,
      totalPromptTokens,
      totalOutputTokens,
      totalToolCalls,
      avgLatencyMs: avgLatency,
    },
    recent: rows.slice(0, 20),
  });
}
