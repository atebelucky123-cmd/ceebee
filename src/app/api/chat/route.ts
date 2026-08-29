import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runAgent } from "@/lib/agent";

export async function POST(req: NextRequest) {
  try {
    const { message, history, accountLabel } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: account, error } = await supabase
      .from("google_accounts")
      .select("refresh_token")
      .eq("label", accountLabel ?? "default")
      .single();

    if (error || !account) {
      return NextResponse.json(
        {
          error:
            "No Google account connected yet. Visit /api/auth/google to connect one first.",
        },
        { status: 400 }
      );
    }

    const reply = await runAgent(message, account.refresh_token, history ?? []);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chat route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
