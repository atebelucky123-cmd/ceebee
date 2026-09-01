import { getSupabaseServerClient } from "@/lib/supabase";

// Llama 3.1 8B and Gemini 2.5 Flash both turned out to be unavailable on
// Shina's free-tier accounts (confirmed via live "model_not_found"/404
// errors) -- trimmed down to the two models that actually work.
export const AVAILABLE_MODELS = [
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Groq)", provider: "groq" as const },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", provider: "gemini" as const },
];

const DEFAULT_MODEL = "openai/gpt-oss-120b";

export async function getCurrentModel(): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("app_settings")
    .select("model")
    .eq("id", 1)
    .single();

  const model = data?.model ?? DEFAULT_MODEL;
  // Guard against a stale/removed model still saved from before.
  return AVAILABLE_MODELS.some((m) => m.id === model) ? model : DEFAULT_MODEL;
}

export async function setCurrentModel(model: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ model, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

export function providerForModel(model: string): "gemini" | "groq" {
  return AVAILABLE_MODELS.find((m) => m.id === model)?.provider ?? "groq";
}
