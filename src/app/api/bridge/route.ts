import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runAgent } from "@/lib/agent";

// A single-turn entry point for external triggers -- Gemini's own custom
// function calling, a Siri Shortcut, or any webhook-capable tool. No
// conversation history is used here; each call is a standalone command.
// Protected by a shared secret so only Shina's own tools can reach it.
export async function POST(req: NextRequest) {
  const { secret, command, accountLabel } = await req.json();

  if (!secret || secret !== process.env.BRIDGE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!command || typeof command !== "string") {
    return NextResponse.json({ error: "Missing command" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: account, error } = await supabase
    .from("google_accounts")
    .select("refresh_token")
    .eq("label", accountLabel ?? "default")
    .single();

  if (error || !account) {
    return NextResponse.json(
      { error: "No Google account connected yet." },
      { status: 400 }
    );
  }

  try {
    const reply = await runAgent(command, account.refresh_token, []);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
