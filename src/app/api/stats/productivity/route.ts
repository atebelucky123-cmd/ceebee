import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

function isoDate(d: Date) {
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export async function GET() {
  const supabase = getSupabaseServerClient();

  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(isoDate(d));
  }

  const earliest = days[0];

  const [{ data: tasks }, { data: events }] = await Promise.all([
    supabase.from("tasks").select("due_date, done").gte("due_date", earliest),
    supabase
      .from("schedule_events")
      .select("event_date, done")
      .gte("event_date", earliest),
  ]);

  const perDay = days.map((date) => {
    const dayTasks = (tasks ?? []).filter((t) => t.due_date === date);
    const dayEvents = (events ?? []).filter((e) => e.event_date === date);
    const total = dayTasks.length + dayEvents.length;
    const done =
      dayTasks.filter((t) => t.done).length +
      dayEvents.filter((e) => e.done).length;
    return {
      date,
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });

  return NextResponse.json({ days: perDay });
}
