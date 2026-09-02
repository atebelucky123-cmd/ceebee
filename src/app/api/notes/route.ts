import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createNote } from "@/lib/notes";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data });
}

export async function POST(req: NextRequest) {
  const { title, body } = await req.json();
  if (!body) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }

  try {
    const { note } = await createNote({ title, body });
    return NextResponse.json({ note });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create note" },
      { status: 500 }
    );
  }
}
