import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { generateConversationTitle } from "@/lib/agent";

// Called once, fire-and-forget, right after the first exchange in a new
// conversation -- replaces the truncated-first-message placeholder title
// with a real short summary, the way Gemini/ChatGPT rename chats. If this
// fails for any reason the conversation just keeps its placeholder title,
// so the caller never needs to await or handle errors from this.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userMessage, reply } = await req.json();

  if (!userMessage || !reply) {
    return NextResponse.json({ error: "Missing userMessage or reply" }, { status: 400 });
  }

  const title = await generateConversationTitle(userMessage, reply);
  if (!title) {
    return NextResponse.json({ title: null });
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("conversations").update({ title }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ title });
}
