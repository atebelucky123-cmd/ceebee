import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { decodeStoredMessage } from "@/lib/cards";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // One-line preview of CeeBee's latest reply per conversation ("Gym moved
  // to Tue 07:00"), from one query over recent replies rather than one
  // query per conversation.
  const ids = (data ?? []).slice(0, 60).map((c) => c.id);
  const previews: Record<string, string> = {};
  if (ids.length) {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", ids)
      .eq("role", "model")
      .order("created_at", { ascending: false })
      .limit(400);
    for (const m of msgs ?? []) {
      if (previews[m.conversation_id]) continue;
      const { text, cards } = decodeStoredMessage(m.content);
      const receipt = cards.find((c) => c.type === "actions");
      const line =
        receipt && receipt.type === "actions" && receipt.items[0]?.ok
          ? receipt.items[0].text
          : text.split("\n").find((l) => l.trim()) ?? "";
      previews[m.conversation_id] = line.replace(/^⚠️\s*/, "").slice(0, 80);
    }
  }

  return NextResponse.json({
    conversations: (data ?? []).map((c) => ({ ...c, preview: previews[c.id] ?? null })),
  });
}

export async function POST(req: NextRequest) {
  const { title } = await req.json().catch(() => ({}));
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: title || "New chat" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: data });
}
