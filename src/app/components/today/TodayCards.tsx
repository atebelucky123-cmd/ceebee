"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon, VideoIcon, CloudIcon, RainIcon, SunIcon } from "../Icons";

// Shapes returned by /api/brief.
export type AgendaItem = {
  id: string;
  source: "schedule" | "calendar";
  title: string;
  date: string;
  start: string | null;
  end: string | null;
  priority: number | null;
  done: boolean;
  cleared: boolean;
  meetLink: string | null;
  recurring: boolean;
  reminder: number | null;
  rainChance: number | null;
};

export type Insight = { id: string; tone: "honey" | "ember"; text: string; action?: { label: string; prompt: string } };

export type Brief = {
  greeting: string;
  dateLabel: string;
  now: string;
  weather: { temp: number; condition: string; high: number; low: number; note: string | null } | null;
  nextUp: { item: AgendaItem; minutesUntil: number } | null;
  today: AgendaItem[];
  insights: Insight[];
  tasks: { open: number; done: number; total: number };
  unread: number;
  accounts: { label: string; email: string }[];
  message: string;
  suggestions: string[];
};

export function relativeLabel(minutes: number): string {
  if (minutes < 0) return "HAPPENING NOW";
  if (minutes < 1) return "STARTING NOW";
  if (minutes < 60) return `IN ${minutes} MIN`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `IN ${h}H ${m}M` : `IN ${h}H`;
}

export function WeatherIcon({ condition, size = 28 }: { condition: string; size?: number }) {
  const c = condition.toLowerCase();
  if (/rain|drizzle|shower|thunder/.test(c)) return <RainIcon size={size} />;
  if (/clear|sunny/.test(c)) return <SunIcon size={size} />;
  return <CloudIcon size={size} />;
}

export function NextUpBanner({ nextUp, size = "lg" }: { nextUp: Brief["nextUp"]; size?: "lg" | "sm" }) {
  if (!nextUp) {
    return (
      <div className="rounded-[20px] border border-line-strong bg-surface px-6 py-5 flex flex-col gap-1">
        <div className="text-xs font-bold tracking-[0.06em] text-muted">NEXT UP</div>
        <div className="font-display font-extrabold text-xl tracking-tight">Nothing else timed today.</div>
        <div className="text-sm text-muted">Ask CeeBee to plan something, or enjoy the space.</div>
      </div>
    );
  }
  const { item, minutesUntil } = nextUp;
  const join = item.meetLink && (
    <a
      href={item.meetLink}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-[14px] bg-ground text-cream font-semibold shrink-0 hover:text-honey ${
        size === "lg" ? "h-12 px-[22px] text-[15px]" : "h-10 px-4 text-sm rounded-xl"
      }`}
    >
      <VideoIcon size={18} />
      {size === "lg" ? "Join Meet" : "Join"}
    </a>
  );
  const time = `${item.start ?? ""}${item.end ? ` – ${item.end}` : ""}`;
  const where = [item.meetLink ? "Google Meet" : null, item.source === "calendar" ? "Calendar" : item.priority ? `Schedule · P${item.priority}` : "Schedule"]
    .filter(Boolean)
    .join(" · ");

  if (size === "sm") {
    return (
      <div className="p-[18px] rounded-[20px] bg-honey text-ground flex flex-col gap-2.5">
        <div className="text-xs font-bold tracking-[0.06em]">NEXT UP · {relativeLabel(minutesUntil)}</div>
        <div className="font-display font-extrabold text-[22px] tracking-tight leading-tight">{item.title}</div>
        <div className="flex justify-between items-center gap-3">
          <span className="font-mono text-[13px]">{time}</span>
          {join}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-6 px-7 py-6 rounded-[20px] bg-honey text-ground">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="text-[13px] font-bold tracking-[0.06em]">NEXT UP · {relativeLabel(minutesUntil)}</div>
        <div className="font-display font-extrabold text-[30px] tracking-tight leading-tight truncate">{item.title}</div>
        <div className="font-mono text-sm">
          {time} · {where}
        </div>
      </div>
      {join}
    </div>
  );
}

export function InsightCard({ insight, onAct }: { insight: Insight; onAct: (prompt: string) => void }) {
  return (
    <div className="px-4 py-3.5 rounded-2xl bg-surface border border-line-strong flex gap-3 items-start">
      <span className={`w-2 h-2 mt-[7px] rounded-full shrink-0 ${insight.tone === "ember" ? "bg-ember" : "bg-honey"}`} />
      <div className="text-sm leading-normal flex-1">
        {insight.text}{" "}
        {insight.action && (
          <button onClick={() => onAct(insight.action!.prompt)} className="font-bold text-honey hover:text-honey-hover">
            {insight.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

type Task = { id: string; title: string; done: boolean; due_date: string | null };

export function TasksCard({ refreshKey = 0, limit = 5, compact = false }: { refreshKey?: number; limit?: number; compact?: boolean }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [newTask, setNewTask] = useState("");

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks ?? []))
      .catch(() => setTasks([]));
  }, [refreshKey]);

  async function toggle(id: string, done: boolean) {
    setTasks((prev) => prev?.map((t) => (t.id === id ? { ...t, done } : t)) ?? prev);
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
  }

  async function add() {
    const title = newTask.trim();
    if (!title) return;
    setNewTask("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const d = await res.json();
    if (d.task) setTasks((prev) => [d.task, ...(prev ?? [])]);
  }

  const all = tasks ?? [];
  const done = all.filter((t) => t.done).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const open = all.filter((t) => !t.done);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className={compact ? "flex flex-col gap-2" : "bg-surface border border-line rounded-[20px] px-6 py-[22px] flex flex-col gap-3"}>
      <div className="flex justify-between items-center">
        <h2 className={`m-0 font-bold ${compact ? "text-base" : "text-[17px]"}`}>Tasks</h2>
        <span className="font-mono text-[13px] text-muted">
          {done} / {all.length} done
        </span>
      </div>
      {!compact && (
        <div className="h-1.5 rounded-full bg-line flex" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks completed">
          <div className="rounded-full bg-honey transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {tasks === null ? (
        <div className="h-11 rounded-xl bg-raised animate-pulse" />
      ) : open.length === 0 ? (
        <p className="text-sm text-muted py-1">{all.length ? "All done. Nice." : "No tasks yet."}</p>
      ) : (
        open.slice(0, limit).map((t) => (
          <label key={t.id} className="flex items-center gap-3 min-h-11 text-[15px] cursor-pointer">
            <input type="checkbox" checked={t.done} onChange={(e) => toggle(t.id, e.target.checked)} className="w-5 h-5 shrink-0" />
            <span className="flex-1 min-w-0">{t.title}</span>
            {t.due_date && t.due_date < today && <span className="text-[11px] font-bold text-ember shrink-0">OVERDUE</span>}
          </label>
        ))
      )}
      <div className="flex items-center gap-2">
        <label htmlFor={`quick-task-${compact ? "m" : "d"}`} className="sr-only">
          Add a task
        </label>
        <input
          id={`quick-task-${compact ? "m" : "d"}`}
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="+ Add a task"
          className="flex-1 min-w-0 h-10 bg-transparent border-b border-line text-sm outline-none focus:border-honey placeholder:text-muted"
        />
        {open.length > limit && (
          <Link href="/tasks" className="text-[13px] font-semibold text-honey shrink-0">
            +{open.length - limit} more
          </Link>
        )}
      </div>
    </section>
  );
}

export function RemindersCard({ items }: { items: AgendaItem[] }) {
  const reminders = items.filter((i) => i.reminder !== null && !i.done).slice(0, 4);
  return (
    <section className="bg-surface border border-line rounded-[20px] px-6 py-[22px] flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h2 className="m-0 text-[17px] font-bold">Reminders</h2>
        <Link href="/reminders" className="text-[13px] font-semibold text-honey">
          See all
        </Link>
      </div>
      {reminders.length === 0 ? (
        <p className="text-sm text-muted">No reminders left today.</p>
      ) : (
        reminders.map((r) => (
          <div key={r.id} className="flex items-center gap-3 text-[15px]">
            <BellIcon size={18} className="text-honey shrink-0" />
            <span className="flex-1 min-w-0 truncate">{r.title}</span>
            <span className="font-mono text-[13px] text-muted">{r.start ?? "—"}</span>
          </div>
        ))
      )}
    </section>
  );
}

export function StatsCard() {
  const [days, setDays] = useState<{ date: string; total: number; done: number; pct: number }[] | null>(null);

  useEffect(() => {
    fetch("/api/stats/productivity")
      .then((r) => r.json())
      .then((d) => setDays(d.days ?? []))
      .catch(() => setDays([]));
  }, []);

  const avg = days && days.length ? Math.round(days.reduce((s, d) => s + d.pct, 0) / days.length) : 0;
  const today = days?.[days.length - 1];

  return (
    <section className="bg-surface border border-line rounded-[20px] px-6 py-[22px] flex flex-col gap-4">
      <div className="flex justify-between items-baseline">
        <h2 className="m-0 text-[17px] font-bold">This week</h2>
        <span className="font-mono text-[13px] text-muted">avg {avg}%</span>
      </div>
      {today && (
        <div className="flex items-baseline gap-3">
          <span className="font-display font-extrabold text-5xl text-honey tracking-tight">{today.pct}%</span>
          <span className="text-sm text-muted">
            {today.done} of {today.total} done today
          </span>
        </div>
      )}
      {days === null ? (
        <div className="h-28 rounded-xl bg-raised animate-pulse" />
      ) : (
        <div className="flex items-end justify-between gap-2 h-28" aria-label="Completion over the last 7 days">
          {days.map((d, i) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 h-full">
              <div className="w-full flex-1 flex items-end">
                <div
                  className={`w-full rounded-t-md transition-all ${i === days.length - 1 ? "bg-honey" : "bg-chip"}`}
                  style={{ height: `${Math.max(d.pct, 4)}%` }}
                  title={`${d.pct}% (${d.done}/${d.total})`}
                />
              </div>
              <span className="font-mono text-[10px] text-muted">
                {new Date(`${d.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "narrow" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
