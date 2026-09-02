import { randomUUID } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase";
import { expandRecurrenceDates, type Recurrence } from "@/lib/recurrence";

export interface CreateScheduleEventInput {
  title: string;
  description?: string | null;
  event_date: string; // YYYY-MM-DD -- date of the first occurrence
  start_time?: string | null; // HH:MM
  end_time?: string | null; // HH:MM
  meeting_link?: string | null;
  priority?: number; // 1-5
  remind_before_minutes?: number | null;
  recurrence?: Recurrence;
  recurrence_days?: number[] | null; // 0=Sunday..6=Saturday, only for "custom"
}

// Creates one schedule event, or -- if a recurrence rule is given -- one
// row per matching date over the recurrence horizon, all sharing a
// series_id. Used by both POST /api/schedule (the Add Event form) and
// CeeBee's create_schedule_event tool, so the two can never drift apart on
// what "every day" or "weekdays" actually means.
export async function createScheduleEvent(input: CreateScheduleEventInput) {
  const rule: Recurrence = input.recurrence ?? "none";

  if (rule === "custom" && (!input.recurrence_days || input.recurrence_days.length === 0)) {
    throw new Error("Pick at least one day for a custom repeat.");
  }

  const dates = expandRecurrenceDates(input.event_date, rule, input.recurrence_days ?? null);
  const seriesId = rule === "none" ? null : randomUUID();

  const rows = dates.map((date) => ({
    title: input.title,
    description: input.description ?? null,
    event_date: date,
    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
    meeting_link: input.meeting_link ?? null,
    priority: input.priority ?? 3,
    remind_before_minutes: input.remind_before_minutes ?? null,
    recurrence: rule,
    recurrence_days: rule === "custom" ? input.recurrence_days : null,
    series_id: seriesId,
  }));

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("schedule_events").insert(rows).select();
  if (error) throw new Error(error.message);

  // The occurrence that actually falls on the date the caller asked for --
  // existing callers that expect a single `event` back keep working.
  const first = data?.find((e) => e.event_date === input.event_date) ?? data?.[0];
  return { event: first, occurrences: data?.length ?? 0 };
}

export async function listScheduleEvents(date?: string, sort: "time" | "priority" = "time") {
  const supabase = getSupabaseServerClient();
  let query = supabase.from("schedule_events").select("*");
  if (date) query = query.eq("event_date", date);

  query =
    sort === "priority"
      ? query.order("priority", { ascending: true })
      : query.order("start_time", { ascending: true, nullsFirst: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Deletes one occurrence, or -- with scope "series" -- this occurrence and
// every future occurrence sharing its series_id (past occurrences are left
// alone, so history stays intact). Shared by DELETE /api/schedule/:id and
// CeeBee's delete_schedule_event tool.
export async function deleteScheduleEvent(id: string, scope: "single" | "series" = "single") {
  const supabase = getSupabaseServerClient();

  if (scope === "series") {
    const { data: row, error: lookupError } = await supabase
      .from("schedule_events")
      .select("series_id, event_date")
      .eq("id", id)
      .single();
    if (lookupError) throw new Error(lookupError.message);

    if (row?.series_id) {
      const { error } = await supabase
        .from("schedule_events")
        .delete()
        .eq("series_id", row.series_id)
        .gte("event_date", row.event_date);
      if (error) throw new Error(error.message);
      return { success: true, scope: "series" as const };
    }
    // Not actually part of a series -- fall through to a normal single delete.
  }

  const { error } = await supabase.from("schedule_events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true, scope: "single" as const };
}
