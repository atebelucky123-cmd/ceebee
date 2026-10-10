import { listScheduleEvents } from "@/lib/schedule";
import { listEventsInRange } from "@/lib/calendar";
import { fetchWeather, DEFAULT_LAT, DEFAULT_LON, type FullWeatherData } from "@/lib/weather";
import { LAGOS_OFFSET, lagosTimeOfISO, toMinutes } from "@/lib/time";

// One merged timeline for a day: Shina's personal Schedule (Supabase) and
// her Google Calendar, which used to live in separate lists everywhere.
// CeeBee, the Today screen, and the morning brief all read this, so "what's
// on my afternoon" means the same thing in all three places.

export type AgendaItem = {
  id: string;
  source: "schedule" | "calendar";
  title: string;
  date: string; // YYYY-MM-DD
  start: string | null; // HH:MM (Lagos)
  end: string | null;
  priority: number | null; // schedule only, 1-5
  done: boolean;
  cleared: boolean;
  meetLink: string | null;
  recurring: boolean;
  reminder: number | null;
  rainChance: number | null; // % at the item's start hour, when forecast covers it
};

type ScheduleRow = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  priority: number;
  done: boolean;
  cleared: boolean;
  meeting_link: string | null;
  recurrence?: string | null;
  remind_before_minutes: number | null;
};

// --- Weather (cached) -----------------------------------------------------
// Open-Meteo is free but every Today load, brief, and chat turn wants the
// forecast -- a short in-memory cache keeps that to one fetch per area per
// 15 minutes (per server instance).

const weatherCache = new Map<string, { at: number; data: FullWeatherData }>();
const WEATHER_TTL_MS = 15 * 60_000;

export async function getWeatherCached(
  location: { lat: number; lon: number } | null
): Promise<FullWeatherData | null> {
  const lat = location?.lat ?? DEFAULT_LAT;
  const lon = location?.lon ?? DEFAULT_LON;
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.data;
  try {
    const data = await fetchWeather(lat, lon);
    weatherCache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error("getWeatherCached: weather unavailable", err);
    return hit?.data ?? null;
  }
}

// Rain chance (%) for a given Lagos date + hour, if the 24h hourly forecast
// reaches that far.
export function rainChanceAt(weather: FullWeatherData | null, date: string, hhmm: string | null): number | null {
  if (!weather || !hhmm) return null;
  const hourKey = `${date}T${hhmm.slice(0, 2)}:00`;
  const slot = weather.hourly.find((h) => h.time.startsWith(hourKey));
  return slot ? slot.precipChance : null;
}

export async function getAgenda(
  date: string,
  refreshToken: string | null,
  weather: FullWeatherData | null = null
): Promise<AgendaItem[]> {
  const [scheduleRows, calendarRows] = await Promise.all([
    listScheduleEvents(date).catch((err) => {
      console.error("getAgenda: schedule lookup failed", err);
      return [] as ScheduleRow[];
    }),
    refreshToken
      ? listEventsInRange(
          refreshToken,
          new Date(`${date}T00:00:00${LAGOS_OFFSET}`).toISOString(),
          new Date(`${date}T23:59:59${LAGOS_OFFSET}`).toISOString()
        ).catch((err) => {
          console.error("getAgenda: calendar lookup failed", err);
          return [];
        })
      : Promise.resolve([]),
  ]);

  const items: AgendaItem[] = [
    ...(scheduleRows as ScheduleRow[]).map((e) => {
      const start = e.start_time?.slice(0, 5) ?? null;
      return {
        id: e.id,
        source: "schedule" as const,
        title: e.title,
        date: e.event_date,
        start,
        end: e.end_time?.slice(0, 5) ?? null,
        priority: e.priority,
        done: !!e.done,
        cleared: !!e.cleared,
        meetLink: e.meeting_link,
        recurring: !!e.recurrence && e.recurrence !== "none",
        reminder: e.remind_before_minutes,
        rainChance: rainChanceAt(weather, e.event_date, start),
      };
    }),
    ...calendarRows.map((e) => {
      const start = lagosTimeOfISO(e.start);
      return {
        id: e.id ?? "",
        source: "calendar" as const,
        title: e.title ?? "(No title)",
        date,
        start,
        end: lagosTimeOfISO(e.end),
        priority: null,
        done: false,
        cleared: false,
        meetLink: e.meetLink,
        recurring: false,
        reminder: null,
        rainChance: rainChanceAt(weather, date, start),
      };
    }),
  ];

  // Timed items in order, untimed/all-day items last.
  return items.sort((a, b) => {
    if (a.start && b.start) return toMinutes(a.start) - toMinutes(b.start);
    if (a.start) return -1;
    if (b.start) return 1;
    return 0;
  });
}
