// Converts a Date to YYYY-MM-DD in the browser's local timezone. Using
// Date.toISOString() directly is the trap: it converts to UTC first, which
// silently shifts the date backward for any timezone ahead of UTC (like
// Lagos, UTC+1) whenever local midnight lands in the previous UTC day --
// this was the root cause of the calendar grid showing events one day off.
export function toLocalDateKey(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

// Same idea, but for server code (CeeBee's agent) that needs "today" in
// Shina's timezone specifically, regardless of what timezone the server
// process itself runs in.
export function todayLagosDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}
