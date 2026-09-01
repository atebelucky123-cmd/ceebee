import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createCalendarEvent, deleteCalendarEvent } from "@/lib/calendar";

// Generates a standalone Google Meet link without leaving a real event
// sitting on the calendar. Google mints a persistent Meet room the moment
// conferenceData is attached to an event; that room stays valid even after
// the placeholder event is deleted, so this creates a short throwaway
// event purely to get a link, then cleans it up. Used by the "Generate"
// option on both the Schedule form and the Calendar form.
async function getDefaultAccountToken() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("google_accounts")
    .select("refresh_token")
    .eq("label", "default")
    .single();
  if (error || !data) throw new Error("No Google account connected yet.");
  return data.refresh_token as string;
}

export async function POST() {
  try {
    const token = await getDefaultAccountToken();
    const start = new Date(Date.now() + 5 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const event = await createCalendarEvent(token, {
      title: "CeeBee Meet link",
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      createMeetLink: true,
    });

    if (!event.meetLink) {
      throw new Error("Google didn't return a Meet link. Try again.");
    }

    if (event.eventId) {
      // Best-effort cleanup -- if this fails, the link is still valid, it
      // just leaves a harmless 30-minute placeholder on the calendar.
      deleteCalendarEvent(token, event.eventId).catch(() => {});
    }

    return NextResponse.json({ meetLink: event.meetLink });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't generate a Meet link." },
      { status: 500 }
    );
  }
}
