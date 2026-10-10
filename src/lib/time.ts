// Shina lives in Lagos (UTC+1, no DST). Server code -- the agent, the brief,
// the agenda -- must reason in Lagos time regardless of where the server
// process itself runs, so every "what time is it / what day is it" question
// goes through here rather than through Date's local-time methods.

export const LAGOS_TZ = "Africa/Lagos";
export const LAGOS_OFFSET = "+01:00";

export function lagosParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
    hour: Number(get("hour")),
  };
}

export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function weekdayOfKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function labelForKey(dateKey: string, style: "long" | "short" = "long"): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: style,
    day: "numeric",
    month: style === "long" ? "long" : "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

// "SAT · 10 OCTOBER" -- the mono eyebrow above the Today greeting.
export function eyebrowDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const wd = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(date);
  return `${wd} · ${d} ${month}`.toUpperCase();
}

// Minutes from now until a Lagos-local date + HH:MM (negative if past).
export function minutesUntil(dateKey: string, hhmm: string, now: Date = new Date()): number {
  const target = new Date(`${dateKey}T${hhmm.slice(0, 5)}:00${LAGOS_OFFSET}`);
  return Math.round((target.getTime() - now.getTime()) / 60_000);
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// "HH:MM" in Lagos time for an ISO datetime from Google Calendar. All-day
// events come through as a bare YYYY-MM-DD, which has no time -- null.
export function lagosTimeOfISO(iso: string | null | undefined): string | null {
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return lagosParts(new Date(iso)).hhmm;
}
