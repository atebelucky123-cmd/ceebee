import { getSupabaseServerClient } from "@/lib/supabase";

export interface CreateTaskInput {
  title: string;
  due_date?: string | null; // YYYY-MM-DD
  start_time?: string | null; // HH:MM
  end_time?: string | null; // HH:MM
}

export async function createTask(input: CreateTaskInput) {
  if (!input.title) throw new Error("A task needs a title.");

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      due_date: input.due_date ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { task: data };
}
