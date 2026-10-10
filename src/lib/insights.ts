import type { AgendaItem } from "@/lib/agenda";
import type { FullWeatherData } from "@/lib/weather";
import { addDaysToKey, labelForKey, lagosParts, minutesUntil, toMinutes } from "@/lib/time";

// What CeeBee *notices* about Shina's day -- computed deterministically from
// real data (agenda, forecast, tasks), never guessed by the model. Each
// insight can carry a one-tap action, which is just a sentence handed to
// CeeBee's chat to carry out (so the fix goes through the same tools, dedup
// and honesty checks as anything Shina types herself).

export type Insight = {
  id: string;
  tone: "honey" | "ember";
  text: string;
  action?: { label: string; prompt: string };
};

export type NextUp = {
  item: AgendaItem;
  minutesUntil: number; // negative = already started
};

type TaskRow = { id: string; title: string; due_date: string | null; done: boolean };

const RAIN_THRESHOLD = 50;
const DEFAULT_DURATION_MIN = 30;

export function spokenTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function endMinutes(item: AgendaItem): number {
  const start = toMinutes(item.start!);
  return item.end ? toMinutes(item.end) : start + DEFAULT_DURATION_MIN;
}

function overlaps(a: AgendaItem, b: AgendaItem): boolean {
  if (!a.start || !b.start) return false;
  return toMinutes(a.start) < endMinutes(b) && toMinutes(b.start) < endMinutes(a);
}

function isFree(agenda: AgendaItem[], start: string): boolean {
  const probe: AgendaItem = { ...agenda[0], start, end: null } as AgendaItem;
  return !agenda.some((i) => i.start && !i.done && overlaps(i, probe));
}

export function findNextUp(today: AgendaItem[], now: Date = new Date()): NextUp | null {
  const { dateKey } = lagosParts(now);
  for (const item of today) {
    if (!item.start || item.done || item.cleared) continue;
    const mins = minutesUntil(dateKey, item.start, now);
    const runningFor = -mins;
    const duration = endMinutes(item) - toMinutes(item.start);
    // Upcoming, or started but still within its slot.
    if (mins >= 0 || runningFor < duration) return { item, minutesUntil: mins };
  }
  return null;
}

export function computeInsights({
  today,
  tomorrow,
  tasks,
  weather,
  now = new Date(),
}: {
  today: AgendaItem[];
  tomorrow: AgendaItem[];
  tasks: TaskRow[];
  weather: FullWeatherData | null;
  now?: Date;
}): Insight[] {
  const insights: Insight[] = [];
  const { dateKey, hhmm } = lagosParts(now);
  const tomorrowKey = addDaysToKey(dateKey, 1);
  const tomorrowName = labelForKey(tomorrowKey, "short").split(" ")[0]; // "Tue"
  const upcoming = today.filter((i) => i.start && !i.done && !i.cleared && toMinutes(i.start) >= toMinutes(hhmm));

  // 1. Rain landing on something she has to physically go to. Anything with
  //    a meeting link is assumed to be online and left alone.
  for (const item of upcoming) {
    if (item.meetLink || item.rainChance === null || item.rainChance < RAIN_THRESHOLD) continue;
    const sameTime = item.start!;
    const newTime = tomorrow.length === 0 || isFree(tomorrow, sameTime) ? sameTime : "07:00";
    insights.push({
      id: `rain-${item.id}`,
      tone: "honey",
      text: `Rain around ${spokenTime(item.start!)} (${item.rainChance}%) clashes with ${item.title}.`,
      action: {
        label: `Move to ${tomorrowName} ${newTime}`,
        prompt: `Move "${item.title}" (today at ${item.start}) to tomorrow at ${newTime} because of the rain.`,
      },
    });
    if (insights.length >= 2) break;
  }

  // 2. Double-booked slots.
  for (let i = 0; i < upcoming.length; i++) {
    for (let j = i + 1; j < upcoming.length; j++) {
      const a = upcoming[i];
      const b = upcoming[j];
      if (!overlaps(a, b)) continue;
      insights.push({
        id: `clash-${a.id}-${b.id}`,
        tone: "ember",
        text: `${a.title} and ${b.title} overlap at ${b.start}.`,
        action: {
          label: "Sort the clash",
          prompt: `"${a.title}" (${a.start}) and "${b.title}" (${b.start}) overlap today. Suggest how to fix it.`,
        },
      });
    }
  }

  // 3. Overdue tasks.
  const overdue = tasks
    .filter((t) => !t.done && t.due_date && t.due_date < dateKey)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  if (overdue.length > 0) {
    insights.push({
      id: "overdue",
      tone: "ember",
      text:
        overdue.length === 1
          ? `"${overdue[0].title}" is overdue.`
          : `${overdue.length} tasks are overdue, oldest is "${overdue[0].title}".`,
      action: { label: "Plan them in", prompt: "Help me fit my overdue tasks into today or tomorrow." },
    });
  }

  // 4. Heavy rain day with nothing specific clashing -- still worth a nudge.
  if (insights.length === 0 && weather) {
    const rainyHours = weather.hourly
      .filter((h) => h.time.startsWith(dateKey) && h.time.slice(11, 16) >= hhmm && h.precipChance >= 70)
      .map((h) => h.time.slice(11, 16));
    if (rainyHours.length > 0) {
      insights.push({
        id: "rain-general",
        tone: "honey",
        text: `Heavy rain likely from around ${spokenTime(rainyHours[0])}. Take an umbrella if you're heading out.`,
      });
    }
  }

  return insights.slice(0, 4);
}
