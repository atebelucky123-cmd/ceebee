import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { getAccounts } from "@/lib/accounts";

// A single-turn entry point for external triggers -- Gemini's own custom
// function calling, a Siri Shortcut, or any webhook-capable tool. No
// conversation history is used here; each call is a standalone command.
// Protected by a shared secret so only Shina's own tools can reach it.
//
// Note: since v2, CeeBee drafts emails rather than sending them. A draft
// made through the bridge has no card to tap Send on, so the reply says so.
export async function POST(req: NextRequest) {
  const { secret, command, accountLabel } = await req.json();

  if (!secret || secret !== process.env.BRIDGE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!command || typeof command !== "string") {
    return NextResponse.json({ error: "Missing command" }, { status: 400 });
  }

  try {
    const accounts = await getAccounts();
    const reply = await runAgent(command, accounts, [], null, accountLabel ?? null);
    const draft = reply.cards.find((c) => c.type === "email_draft");
    const text =
      draft && draft.type === "email_draft"
        ? `${reply.text} I can't send from here, so it hasn't gone out. Draft to ${draft.to}: "${draft.body}"`
        : reply.text;
    return NextResponse.json({ reply: text, cards: reply.cards });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
