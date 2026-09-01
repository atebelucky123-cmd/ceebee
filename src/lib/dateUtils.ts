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
