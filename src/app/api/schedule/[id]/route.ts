import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { deleteScheduleEvent, updateScheduleEvent } from "@/lib/schedule";

// Accepts either a partial update (e.g. just { done }) or a full edit
// (title, description, date/time, priority, reminder, meeting link).
// `done` and `recurrence`/`recurrence_days` stay handled directly here
// (completion-toggling and series metadata aren't part of what CeeBee's
// update_schedule_event tool touches) -- everything else now goes through
// the same updateScheduleEvent used by that tool, so the dashboard's Edit
// form and CeeBee can never drift apart on what an "edit" actually changes.
// Editing recurrence here only changes this one row's metadata -- it does
// not regenerate the rest of the series. To start a new recurring series,
// create a new event via POST /api/schedule.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  try {
    if ("done" in body || "recurrence" in body || "recurrence_days" in body) {
      const supabase = getSupabaseServerClient();
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
      const { data, error } = await supabase
        .from("schedule_events")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ event: data });
    }

    const { event } = await updateScheduleEvent(id, body);
    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update event" },
      { status: 500 }
    );
  }
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
