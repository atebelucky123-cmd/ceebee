import { getSupabaseServerClient } from "@/lib/supabase";

export const AVAILABLE_MODELS = [
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Groq)", provider: "groq" as const },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", provider: "gemini" as const },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" as const },
];

export async function getCurrentModel(): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("app_settings")
    .select("model")
    .eq("id", 1)
    .single();
  return data?.model ?? "llama-3.1-8b-instant";
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
