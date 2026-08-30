import { getSupabaseServerClient } from "@/lib/supabase";

export async function logUsage(entry: {
  model: string;
  promptTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  toolCalls?: number;
  latencyMs?: number;
}) {
  const supabase = getSupabaseServerClient();
  await supabase.from("usage_logs").insert({
    model: entry.model,
    prompt_tokens: entry.promptTokens ?? null,
    output_tokens: entry.outputTokens ?? null,
    thought_tokens: entry.thoughtTokens ?? null,
    cached_tokens: entry.cachedTokens ?? null,
    total_tokens: entry.totalTokens ?? null,
    tool_calls: entry.toolCalls ?? 0,
    latency_ms: entry.latencyMs ?? null,
  });
}
