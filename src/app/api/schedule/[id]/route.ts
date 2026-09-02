import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { deleteScheduleEvent } from "@/lib/schedule";

// Accepts either a partial update (e.g. just { done }) or a full edit
// (title, description, date/time, priority, reminder, meeting link,
// recurrence). Editing recurrence here only changes this one row's
// metadata -- it does not regenerate the rest of the series. To start a
// new recurring series, create a new event via POST /api/schedule.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    "title",
    "description",
    "event_date",
    "start_time",
    "end_time",
    "meeting_link",
    "priority",
    "remind_before_minutes",
    "done",
    "recurrence",
    "recurrence_days",
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) update[key] = body[key];
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("schedule_events")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}

// DELETE /api/schedule/:id            -- deletes just this one occurrence.
// DELETE /api/schedule/:id?scope=series -- deletes this occurrence and
// every future occurrence in the same recurring series.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const scope = req.nextUrl.searchParams.get("scope") === "series" ? "series" : "single";

  try {
    const result = await deleteScheduleEvent(id, scope);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete event" },
      { status: 500 }
    );
  }
}
