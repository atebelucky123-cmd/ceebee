import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { getAccounts } from "@/lib/accounts";

export async function POST(req: NextRequest) {
  try {
    const { message, history, accountLabel, lat, lon } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // No account is no longer a hard stop: Schedule, Tasks, Notes, Weather and
    // memory all work without Google. Calendar/email tools explain themselves
    // if she asks for them before connecting.
    const accounts = await getAccounts().catch((err) => {
      console.error("Chat route: couldn't load accounts, continuing without Google", err);
      return [];
    });

    // Real coordinates from the browser so weather answers (and rain-clash
    // warnings) are for where Shina actually is. null = default location.
    const location =
      typeof lat === "number" && typeof lon === "number" && !Number.isNaN(lat) && !Number.isNaN(lon)
        ? { lat, lon }
        : null;

    const reply = await runAgent(message, accounts, history ?? [], location, accountLabel ?? null);

    return NextResponse.json(reply);
  } catch (err) {
    console.error("Chat route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
