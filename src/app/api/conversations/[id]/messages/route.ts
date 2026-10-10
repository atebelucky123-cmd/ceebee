import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { role, content } = await req.json();

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: id, role, content })
    .select("id")
    .single();

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data?.id ?? null });
}

// Rewrites one stored message -- used when a draft card is sent (or edited),
// so reopening the chat later shows it as "Sent" rather than a live draft
// with a Send button that would send it a second time.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { messageId, content } = await req.json();
  if (!messageId || typeof content !== "string") {
    return NextResponse.json({ error: "Missing messageId or content" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("chat_messages")
    .update({ content })
    .eq("id", messageId)
    .eq("conversation_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
