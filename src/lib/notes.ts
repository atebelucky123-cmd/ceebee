import { getSupabaseServerClient } from "@/lib/supabase";

export interface CreateNoteInput {
  title?: string | null;
  body: string;
}

export async function createNote(input: CreateNoteInput) {
  if (!input.body) throw new Error("A note needs some content.");

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("notes")
    .insert({ title: input.title ?? null, body: input.body })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { note: data };
}
