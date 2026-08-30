import { getSupabaseServerClient } from "@/lib/supabase";

// Returns every stored fact about Shina, oldest first, joined as plain
// lines for injection into the system prompt.
export async function getMemoryFacts(): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("memories")
    .select("fact")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => row.fact);
}

export async function addMemoryFact(fact: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("memories").insert({ fact });
  if (error) throw new Error(error.message);
}
