import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runAgent } from "@/lib/agent";

export async function POST(req: NextRequest) {
  try {
    const { message, history, accountLabel, lat, lon } = await req.json();

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

    // Real coordinates from the browser (see chat/page.tsx), used so
    // CeeBee's get_weather tool answers for where Shina actually is rather
    // than always falling back to the hardcoded default location -- the
    // same source of truth the Weather page already uses via
    // navigator.geolocation. Falls back to null (default location) when
    // geolocation was denied/unavailable or the numbers are malformed.
    const location =
      typeof lat === "number" && typeof lon === "number" && !Number.isNaN(lat) && !Number.isNaN(lon)
        ? { lat, lon }
        : null;

    const reply = await runAgent(message, account.refresh_token, history ?? [], location);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chat route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
