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

export async function listTasks() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface UpdateTaskInput {
  title?: string;
  due_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  done?: boolean;
}

// Shared by PATCH /api/tasks/:id and CeeBee's update_task tool.
export async function updateTask(id: string, updates: UpdateTaskInput) {
  const update: Record<string, unknown> = {};
  if ("done" in updates) {
    update.done = updates.done;
    update.completed_at = updates.done ? new Date().toISOString() : null;
  }
  for (const key of ["title", "due_date", "start_time", "end_time"] as const) {
    if (updates[key] !== undefined) update[key] = updates[key];
  }

  if (Object.keys(update).length === 0) {
    throw new Error("Nothing to update.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { task: data };
}

// Shared by DELETE /api/tasks/:id and CeeBee's delete_task tool.
export async function deleteTask(id: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true };
}
