import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { AVAILABLE_MODELS } from "@/lib/settings";

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

  function summarize(modelId: string) {
    const modelRows = rows.filter((r) => r.model === modelId);
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
