import { getAgenda, getWeatherCached, type AgendaItem } from "@/lib/agenda";
import { listTasks } from "@/lib/tasks";
import { computeInsights, findNextUp, type Insight, type NextUp } from "@/lib/insights";
import { addDaysToKey, labelForKey, lagosParts } from "@/lib/time";
import type { FullWeatherData } from "@/lib/weather";
import type { GoogleAccount } from "@/lib/accounts";

// A compact, always-fresh picture of Shina's day, built once per request.
// Injected into CeeBee's system prompt so she *already knows* today's plan,
// tomorrow's plan, open tasks, and the forecast -- with real ids -- instead
// of having to guess which list tool to call (or not having one available at
// all, which is what made "what does my afternoon look like?" fall flat).

export type TaskRow = { id: string; title: string; due_date: string | null; done: boolean };

export type DayContext = {
  dateKey: string;
  tomorrowKey: string;
  nowHHMM: string;
  today: AgendaItem[];
  tomorrow: AgendaItem[];
  tasks: TaskRow[];
  weather: FullWeatherData | null;
  nextUp: NextUp | null;
  insights: Insight[];
};

export async function buildDayContext(
  primary: GoogleAccount | null,
  location: { lat: number; lon: number } | null
): Promise<DayContext> {
  const now = new Date();
  const { dateKey, hhmm } = lagosParts(now);
  const tomorrowKey = addDaysToKey(dateKey, 1);

  const weather = await getWeatherCached(location);
  const refresh = primary?.refresh_token ?? null;
  const [today, tomorrow, tasks] = await Promise.all([
    getAgenda(dateKey, refresh, weather),
    getAgenda(tomorrowKey, refresh, weather),
    listTasks().catch(() => [] as TaskRow[]),
  ]);

  const taskRows = tasks as TaskRow[];
  return {
    dateKey,
    tomorrowKey,
    nowHHMM: hhmm,
    today,
    tomorrow,
    tasks: taskRows,
    weather,
    nextUp: findNextUp(today, now),
    insights: computeInsights({ today, tomorrow, tasks: taskRows, weather, now }),
  };
}

function agendaLine(i: AgendaItem): string {
  const time = i.start ? `${i.start}${i.end ? `-${i.end}` : ""}` : "anytime";
  const bits = [
    i.source === "calendar" ? "calendar" : `schedule P${i.priority}`,
    i.done ? "DONE" : null,
    i.cleared ? "cleared" : null,
    i.recurring ? "repeats" : null,
    i.meetLink ? "has Meet link" : null,
    i.reminder !== null ? `reminder ${i.reminder}m before` : null,
    i.rainChance !== null && i.rainChance >= 30 ? `rain ${i.rainChance}%` : null,
  ].filter(Boolean);
  return `- ${time} ${i.title} [${bits.join(", ")}] id=${i.id}`;
}

export function describeDayContext(ctx: DayContext, accounts: GoogleAccount[]): string {
  const lines: string[] = [];

  if (ctx.weather) {
    const w = ctx.weather;
    const rainHours = w.hourly
      .filter((h) => h.precipChance >= 50)
      .slice(0, 8)
      .map((h) => `${h.time.slice(5, 10)} ${h.time.slice(11, 16)} ${h.precipChance}%`);
    const tomorrow = w.daily[1];
    lines.push(
      `Weather now: ${w.currentTemp}°C, ${w.condition.toLowerCase()}, high ${w.high}°/low ${w.low}°.` +
        (rainHours.length ? ` Rain likely (next 24h): ${rainHours.join("; ")}.` : " No significant rain in the next 24h.") +
        (tomorrow ? ` Tomorrow: ${tomorrow.condition.toLowerCase()}, ${tomorrow.high}°/${tomorrow.low}°, rain ${tomorrow.precipChance}%.` : "")
    );
  }

  lines.push(`\nTODAY (${labelForKey(ctx.dateKey)}), now ${ctx.nowHHMM}:`);
  lines.push(ctx.today.length ? ctx.today.map(agendaLine).join("\n") : "- nothing scheduled");

  lines.push(`\nTOMORROW (${labelForKey(ctx.tomorrowKey)}):`);
  lines.push(ctx.tomorrow.length ? ctx.tomorrow.map(agendaLine).join("\n") : "- nothing scheduled");

  const open = ctx.tasks.filter((t) => !t.done);
  const done = ctx.tasks.length - open.length;
  lines.push(`\nOPEN TASKS (${open.length} open, ${done} done):`);
  lines.push(
    open.length
      ? open
          .slice(0, 15)
          .map((t) => `- ${t.title}${t.due_date ? ` (due ${t.due_date}${t.due_date < ctx.dateKey ? ", OVERDUE" : ""})` : ""} id=${t.id}`)
          .join("\n")
      : "- none"
  );

  if (ctx.insights.length) {
    lines.push(`\nTHINGS YOU'VE NOTICED (mention when relevant, offer the fix):`);
    lines.push(ctx.insights.map((i) => `- ${i.text}${i.action ? ` Fix: ${i.action.prompt}` : ""}`).join("\n"));
  }

  if (accounts.length) {
    lines.push(`\nCONNECTED GOOGLE ACCOUNTS: ${accounts.map((a) => `${a.label} (${a.email})`).join(", ")}. Calendar writes go to ${accounts[0] ? (accounts.find((a) => a.label === "default") ?? accounts[0]).label : "none"}.`);
  } else {
    lines.push("\nNo Google account connected -- Calendar and email tools won't work.");
  }

  return lines.join("\n");
}
