"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WeatherWidget from "../components/WeatherWidget";
import AddEventForm from "../components/AddEventForm";

type Task = {
  id: string;
  title: string;
  due_date: string | null;
  done: boolean;
};

type ScheduleEvent = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  meeting_link: string | null;
  priority: number;
  remind_before_minutes: number | null;
};

type TopView = "today" | "productivity";
type TodayTab = "myday" | "schedule";

function todayISO() {
  // Local date in YYYY-MM-DD, matching what the schedule_events table expects.
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const [topView, setTopView] = useState<TopView>("today");
  const [todayTab, setTodayTab] = useState<TodayTab>("schedule");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [sortBy, setSortBy] = useState<"time" | "priority">("time");
  const [loading, setLoading] = useState(true);
  const [showAddEvent, setShowAddEvent] = useState(false);

  function reload() {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch(`/api/schedule?date=${todayISO()}&sort=${sortBy}`).then((r) =>
        r.json()
      ),
    ]).then(([taskData, eventData]) => {
      setTasks(taskData.tasks ?? []);
      setEvents(eventData.events ?? []);
    });
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch(`/api/schedule?date=${todayISO()}&sort=${sortBy}`).then((r) =>
        r.json()
      ),
    ])
      .then(([taskData, eventData]) => {
        setTasks(taskData.tasks ?? []);
        setEvents(eventData.events ?? []);
      })
      .finally(() => setLoading(false));
  }, [sortBy]);

  async function toggleTask(id: string, done: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
  }

  const undoneTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  const completionPct =
    tasks.length === 0 ? 0 : Math.round((doneTasks.length / tasks.length) * 100);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 pt-4 pb-2 border-b border-neutral-800">
        <div className="flex bg-neutral-900 rounded-full p-1 text-sm">
          <button
            onClick={() => setTopView("today")}
            className={`flex-1 py-1.5 rounded-full font-medium transition-colors ${
              topView === "today"
                ? "bg-amber-400 text-neutral-950"
                : "text-neutral-400"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTopView("productivity")}
            className={`flex-1 py-1.5 rounded-full font-medium transition-colors ${
              topView === "productivity"
                ? "bg-amber-400 text-neutral-950"
                : "text-neutral-400"
            }`}
          >
            Productivity Tasks
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { href: "/tasks", label: "Tasks" },
            { href: "/notes", label: "Notes" },
            { href: "/reminders", label: "Reminders" },
            { href: "/emails", label: "Emails" },
            { href: "/calendar", label: "Calendar" },
            { href: "/weather", label: "Weather" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 bg-neutral-900 text-neutral-300 text-xs px-3 py-1.5 rounded-full"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {topView === "productivity" ? (
          <ProductivitySummary
            completionPct={completionPct}
            done={doneTasks.length}
            total={tasks.length}
          />
        ) : (
          <>
            <WeatherWidget />

            {/* My Day / Schedule segmented control */}
            <div className="flex bg-neutral-900 rounded-full p-1 text-sm">
              <button
                onClick={() => setTodayTab("myday")}
                className={`flex-1 py-1.5 rounded-full font-medium transition-colors ${
                  todayTab === "myday"
                    ? "bg-neutral-100 text-neutral-950"
                    : "text-neutral-400"
                }`}
              >
                My Day
              </button>
              <button
                onClick={() => setTodayTab("schedule")}
                className={`flex-1 py-1.5 rounded-full font-medium transition-colors ${
                  todayTab === "schedule"
                    ? "bg-neutral-100 text-neutral-950"
                    : "text-neutral-400"
                }`}
              >
                Schedule
              </button>
            </div>

            {loading ? (
              <div className="text-neutral-500 text-sm text-center py-8">
                Loading…
              </div>
            ) : todayTab === "myday" ? (
              <MyDay
                tasks={undoneTasks}
                events={events}
                onToggleTask={toggleTask}
              />
            ) : (
              <>
                <Schedule
                  events={events}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                />
                <button
                  onClick={() => setShowAddEvent(true)}
                  className="w-full bg-amber-400 text-neutral-950 rounded-full py-2.5 font-medium text-sm"
                >
                  + Add Event
                </button>
              </>
            )}
          </>
        )}
      </main>

      {showAddEvent && (
        <AddEventForm
          defaultDate={todayISO()}
          onCreated={reload}
          onClose={() => setShowAddEvent(false)}
        />
      )}
    </div>
  );
}

function ProductivitySummary({
  completionPct,
  done,
  total,
}: {
  completionPct: number;
  done: number;
  total: number;
}) {
  return (
    <div className="bg-neutral-900 rounded-2xl p-6 text-center space-y-2">
      <div className="text-4xl font-bold text-amber-400">{completionPct}%</div>
      <div className="text-sm text-neutral-400">
        {done} of {total} tasks completed today
      </div>
      <div className="w-full bg-neutral-800 rounded-full h-2 mt-3">
        <div
          className="bg-amber-400 h-2 rounded-full transition-all"
          style={{ width: `${completionPct}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500 pt-2">
        Weekly trends coming soon.
      </p>
    </div>
  );
}

function MyDay({
  tasks,
  events,
  onToggleTask,
}: {
  tasks: Task[];
  events: ScheduleEvent[];
  onToggleTask: (id: string, done: boolean) => void;
}) {
  if (tasks.length === 0 && events.length === 0) {
    return (
      <div className="text-neutral-500 text-sm text-center py-8">
        Nothing on your plate today. Ask CeeBee to add something.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase text-neutral-500 font-medium px-1">
            Events
          </h3>
          {events.map((e) => (
            <div key={e.id} className="bg-neutral-900 rounded-xl px-4 py-3">
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm">{e.title}</span>
                {e.start_time && (
                  <span className="text-xs text-neutral-500">
                    {e.start_time.slice(0, 5)}
                  </span>
                )}
              </div>
              {e.description && (
                <p className="text-xs text-neutral-400 mt-1">
                  {e.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {tasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase text-neutral-500 font-medium px-1">
            Tasks
          </h3>
          {tasks.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-3 bg-neutral-900 rounded-xl px-4 py-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={t.done}
                onChange={(e) => onToggleTask(t.id, e.target.checked)}
                className="w-4 h-4 accent-amber-400"
              />
              <span className="text-sm">{t.title}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Schedule({
  events,
  sortBy,
  onSortChange,
}: {
  events: ScheduleEvent[];
  sortBy: "time" | "priority";
  onSortChange: (sort: "time" | "priority") => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2 text-xs">
        <span className="text-neutral-500 self-center">Sort by:</span>
        {(["time", "priority"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => onSortChange(opt)}
            className={`px-3 py-1 rounded-full capitalize ${
              sortBy === opt
                ? "bg-amber-400 text-neutral-950"
                : "bg-neutral-900 text-neutral-400"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="text-neutral-500 text-sm text-center py-8">
          No events scheduled for today.
        </div>
      ) : (
        events.map((e) => (
          <div key={e.id} className="bg-neutral-900 rounded-xl px-4 py-3">
            <div className="flex justify-between items-start">
              <span className="font-medium text-sm">{e.title}</span>
              <span className="text-xs text-amber-400 font-medium">
                P{e.priority}
              </span>
            </div>
            {e.description && (
              <p className="text-xs text-neutral-400 mt-1">{e.description}</p>
            )}
            <div className="flex gap-3 mt-2 text-xs text-neutral-500">
              {e.start_time && <span>{e.start_time.slice(0, 5)}</span>}
              {e.meeting_link && (
                <a
                  href={e.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline"
                >
                  Join meeting
                </a>
              )}
              {e.remind_before_minutes && (
                <span>Reminder: {e.remind_before_minutes}m before</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
