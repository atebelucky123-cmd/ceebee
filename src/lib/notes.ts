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

export async function listNotes() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Shared by PATCH /api/notes/:id and CeeBee's update_note tool.
export async function updateNote(id: string, updates: { title?: string | null; body?: string }) {
  const update: Record<string, unknown> = {};
  if (updates.title !== undefined) update.title = updates.title;
  if (updates.body !== undefined) update.body = updates.body;

  if (Object.keys(update).length === 0) {
    throw new Error("Nothing to update.");
  }
  update.updated_at = new Date().toISOString();

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("notes")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { note: data };
}

// Shared by DELETE /api/notes/:id and CeeBee's delete_note tool.
export async function deleteNote(id: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true };
}
