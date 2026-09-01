import { NextRequest, NextResponse } from "next/server";
import { createScheduleEvent, listScheduleEvents } from "@/lib/schedule";
import type { Recurrence } from "@/lib/recurrence";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? undefined; // YYYY-MM-DD
  const sort = (req.nextUrl.searchParams.get("sort") as "time" | "priority") ?? "time";

  try {
    const events = await listScheduleEvents(date, sort);
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load schedule" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title,
    description,
    event_date,
    start_time,
    end_time,
    meeting_link,
    priority,
    remind_before_minutes,
    recurrence,
    recurrence_days,
  } = body;

  if (!title || !event_date) {
    return NextResponse.json(
      { error: "Missing title or event_date" },
      { status: 400 }
    );
  }

  try {
    const { event, occurrences } = await createScheduleEvent({
      title,
      description,
      event_date,
      start_time,
      end_time,
      meeting_link,
      priority,
      remind_before_minutes,
      recurrence: recurrence as Recurrence | undefined,
      recurrence_days,
    });
    return NextResponse.json({ event, occurrences });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create event" },
      { status: 400 }
    );
  }
}
