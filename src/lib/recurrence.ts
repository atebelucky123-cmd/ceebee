// Recurrence expansion for schedule_events. CeeBee stores recurring events
// as individual materialized rows (one per date) sharing a series_id,
// generated all at once when the event is created -- rather than expanding
// a rule at read time. That keeps every existing "give me events on date X"
// query (GET /api/schedule?date=...) working completely unchanged.
//
// This file has no server-only imports (no supabase, no fs) on purpose --
// it's imported by both the server-side schedule lib and the client-side
// Add Event form, so the "which days does this repeat on" logic only
// exists once.

export type Recurrence = "none" | "daily" | "weekdays" | "weekends" | "custom";

// How far ahead to materialize occurrences when a recurring event is
// created. Long enough to feel "forever" day-to-day without needing a
// background job; if it ever needs extending further out, creating a new
// event with the same title from a later start date works fine in the
// meantime.
export const RECURRENCE_HORIZON_DAYS = 120;

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Returns every date (YYYY-MM-DD, inclusive of startDate) matching the
// recurrence rule, up to `horizonDays` ahead. recurrence "none" always
// returns just [startDate].
export function expandRecurrenceDates(
  startDate: string,
  recurrence: Recurrence,
  recurrenceDays: number[] | null | undefined,
  horizonDays: number = RECURRENCE_HORIZON_DAYS
): string[] {
  if (recurrence === "none") return [startDate];

  const matchesDay = (weekday: number): boolean => {
    switch (recurrence) {
      case "daily":
        return true;
      case "weekdays":
        return weekday >= 1 && weekday <= 5;
      case "weekends":
        return weekday === 0 || weekday === 6;
      case "custom":
        return (recurrenceDays ?? []).includes(weekday);
      default:
        return false;
    }
  };

  const start = parseLocalDate(startDate);
  const dates: string[] = [];
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (matchesDay(d.getDay())) dates.push(toDateKey(d));
  }
  return dates;
}

export const RECURRENCE_OPTIONS: { label: string; value: Recurrence }[] = [
  { label: "Doesn't repeat", value: "none" },
  { label: "Every day", value: "daily" },
  { label: "Weekdays only", value: "weekdays" },
  { label: "Weekends only", value: "weekends" },
  { label: "Custom days…", value: "custom" },
];
