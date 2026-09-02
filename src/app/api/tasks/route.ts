import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createTask } from "@/lib/tasks";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data });
}

export async function POST(req: NextRequest) {
  const { title, due_date, start_time, end_time } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    const { task } = await createTask({ title, due_date, start_time, end_time });
    return NextResponse.json({ task });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create task" },
      { status: 500 }
    );
  }
}
