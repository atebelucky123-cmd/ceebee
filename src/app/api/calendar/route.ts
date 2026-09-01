import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { listUpcomingEvents, listEventsInRange, createCalendarEvent } from "@/lib/calendar";

async function getDefaultAccount() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("google_accounts")
    .select("refresh_token")
    .eq("label", "default")
    .single();
  return { data, error };
}

export async function GET(req: NextRequest) {
  const hoursAhead = req.nextUrl.searchParams.get("hoursAhead");
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");

  const { data: account, error } = await getDefaultAccount();

  if (error || !account) {
    return NextResponse.json(
      { error: "No Google account connected yet." },
      { status: 400 }
    );
  }

  try {
    const events =
      start && end
        ? await listEventsInRange(account.refresh_token, start, end)
        : await listUpcomingEvents(account.refresh_token, Number(hoursAhead ?? 24));
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load calendar" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data: account, error } = await getDefaultAccount();

  if (error || !account) {
    return NextResponse.json(
      { error: "No Google account connected yet." },
      { status: 400 }
    );
  }

  try {
    const event = await createCalendarEvent(account.refresh_token, body);
    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create event" },
      { status: 500 }
    );
  }
}
