import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { listUpcomingEvents } from "@/lib/calendar";

export async function GET(req: NextRequest) {
  const hoursAhead = Number(req.nextUrl.searchParams.get("hoursAhead") ?? 24);

  const supabase = getSupabaseServerClient();
  const { data: account, error } = await supabase
    .from("google_accounts")
    .select("refresh_token")
    .eq("label", "default")
    .single();

  if (error || !account) {
    return NextResponse.json(
      { error: "No Google account connected yet." },
      { status: 400 }
    );
  }

  try {
    const events = await listUpcomingEvents(account.refresh_token, hoursAhead);
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load calendar" },
      { status: 500 }
    );
  }
}
