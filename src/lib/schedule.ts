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

export type ScheduleSort = "time" | "priority" | "custom";

// "custom" = Shina's own order (sort_order, set by the up/down arrows).
// sort_order is also the tiebreaker for untimed items in the other sorts.
// If the sort_order column hasn't been added to the database yet (see
// supabase/schema.sql), this quietly falls back to ordering without it.
export async function listScheduleEvents(date?: string, sort: ScheduleSort = "time") {
  const supabase = getSupabaseServerClient();
  const run = async (withCustomOrder: boolean) => {
    let query = supabase.from("schedule_events").select("*");
    if (date) query = query.eq("event_date", date);
    if (sort === "custom" && withCustomOrder) {
      query = query.order("sort_order", { ascending: true, nullsFirst: false });
    }
    if (sort === "priority") {
      // 5 = urgent, so most important first.
      query = query.order("priority", { ascending: false });
    }
    query = query.order("start_time", { ascending: true, nullsFirst: false });
    if (withCustomOrder) query = query.order("sort_order", { ascending: true, nullsFirst: false });
    return query.order("created_at", { ascending: true });
  };

  let { data, error } = await run(true);
  if (error && /sort_order/.test(error.message)) ({ data, error } = await run(false));
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Saves a day's custom order. Each item's position also applies to every
// future occurrence in its repeating series, so a morning routine stays in
// the order she set it.
export async function reorderScheduleEvents(date: string, orderedIds: string[]) {
  const supabase = getSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("schedule_events")
    .select("id, series_id")
    .in("id", orderedIds);
  if (error) throw new Error(error.message);

  const seriesOf = new Map((rows ?? []).map((r) => [r.id, r.series_id as string | null]));
  for (const [index, id] of orderedIds.entries()) {
    const seriesId = seriesOf.get(id);
    const q = seriesId
      ? supabase.from("schedule_events").update({ sort_order: index }).eq("series_id", seriesId).gte("event_date", date)
      : supabase.from("schedule_events").update({ sort_order: index }).eq("id", id);
    const { error: updateError } = await q;
    if (updateError) {
      throw new Error(
        /sort_order/.test(updateError.message)
          ? "Custom order needs one database update first: run the sort_order line from supabase/schema.sql in Supabase's SQL editor."
          : updateError.message
      );
    }
  }
  return { success: true };
}

// Updates one existing schedule row -- only the fields actually passed are
// touched, so a partial edit (e.g. just priority) never clobbers the rest
// of the row with undefined/null. Shared by PATCH /api/schedule/:id and
// CeeBee's update_schedule_event tool.
export async function updateScheduleEvent(
  id: string,
  updates: Partial<Omit<CreateScheduleEventInput, "recurrence" | "recurrence_days">>
) {
  const update: Record<string, unknown> = {};
  for (const key of [
    "title",
    "description",
    "event_date",
    "start_time",
    "end_time",
    "meeting_link",
    "priority",
    "remind_before_minutes",
  ] as const) {
    if (updates[key] !== undefined) update[key] = updates[key];
  }

  if (Object.keys(update).length === 0) {
    throw new Error("Nothing to update.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("schedule_events")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { event: data };
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
