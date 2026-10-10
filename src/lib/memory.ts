import { getSupabaseServerClient } from "@/lib/supabase";

type MemoryRow = { fact: string; category: string; importance: number };

// Returns only facts relevant to the current message, instead of the whole
// table every time. Cheap keyword-overlap filter: a fact "counts" if it
// shares a meaningful word (4+ letters) with the user's message. Falls back
// to the highest-importance facts if nothing matches, so identity-level
// facts ("Shina runs Xlog Visuals") still surface even on vague messages.
export async function getRelevantMemoryFacts(
  userMessage: string,
  limit: number = 8
): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("memories")
    .select("fact, category, importance")
    .order("importance", { ascending: false });

  if (error || !data || data.length === 0) return [];

  const words = userMessage
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 4);

  const rows = data as MemoryRow[];

  const matched = rows.filter((row) =>
    words.some((w) => row.fact.toLowerCase().includes(w))
  );

  // Identity-level facts (highest importance) always ride along, matched
  // facts fill the rest -- previously the top facts only appeared when
  // nothing matched, so "book dinner with Tolu" could surface a stray
  // keyword hit but lose "Tolu is vegetarian".
  const core = rows.filter((r) => (r.importance ?? 3) >= 4).slice(0, 4);
  const chosen = [...core, ...matched, ...rows.slice(0, 3)];
  const unique = Array.from(new Set(chosen.map((r) => r.fact)));
  return unique.slice(0, limit);
}

export async function addMemoryFact(
  fact: string,
  category: string = "general",
  importance: number = 3
) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("memories")
    .insert({ fact, category, importance });
  if (error) throw new Error(error.message);
}
