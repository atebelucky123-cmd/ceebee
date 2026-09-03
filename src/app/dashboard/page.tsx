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
  end_time: string | null;
  meeting_link: string | null;
  priority: number;
  remind_before_minutes: number | null;
  done: boolean;
  cleared: boolean;
  recurrence?: "none" | "daily" | "weekdays" | "weekends" | "custom";
  recurrence_days?: number[] | null;
  series_id?: string | null;
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

// Native <input type="date"> fires onChange with an EMPTY STRING while
// you're mid-edit (e.g. pressing Backspace to clear a segment before typing
// a new one) -- not just once you've entered a full valid date. Passing that
// straight into calRangeFor's `new Date(...).toISOString()` produced an
// Invalid Date and threw an uncaught RangeError, crashing the whole page.
// This guards selectedDate so it only ever updates on a genuinely complete
// YYYY-MM-DD value; a mid-edit empty string is simply ignored, and the
// previous valid date stays selected until a new complete one is entered.
const FULL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isCompleteDateString(value: string): boolean {
  return FULL_DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

export default function DashboardPage() {
  const [topView, setTopView] = useState<TopView>("today");
  const [todayTab, setTodayTab] = useState<TodayTab>("schedule");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [calEvents, setCalEvents] = useState<
    { id: string; title: string; start: string; end: string; meetLink: string | null }[]
  >([]);
  const [sortBy, setSortBy] = useState<"time" | "priority">("time");
  const [loading, setLoading] = useState(true);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [unreadEmailCount, setUnreadEmailCount] = useState(0);

  useEffect(() => {
    fetch("/api/emails")
      .then((r) => r.json())
      .then((data) => {
        const count = (data.emails ?? []).filter((e: { unread: boolean }) => e.unread).length;
        setUnreadEmailCount(count);
      })
      .catch(() => {});
  }, []);

  function calRangeFor(dateStr: string) {
    // Defense-in-depth: even though selectedDate is now guarded at the
    // source (see isCompleteDateString above), this never trusts its input
    // blindly -- an invalid string here quietly falls back to today instead
    // of throwing an uncaught RangeError on .toISOString() and crashing
    // the whole page again.
    const safeDate = isCompleteDateString(dateStr) ? dateStr : todayISO();
    const start = new Date(`${safeDate}T00:00:00`);
    const end = new Date(`${safeDate}T23:59:59`);
    return `start=${start.toISOString()}&end=${end.toISOString()}`;
  }

  function reload() {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch(`/api/schedule?date=${selectedDate}&sort=${sortBy}`).then((r) => r.json()),
      fetch(`/api/calendar?${calRangeFor(selectedDate)}`).then((r) => r.json()),
    ]).then(([taskData, eventData, calData]) => {
      setTasks(taskData.tasks ?? []);
      setEvents(eventData.events ?? []);
      setCalEvents(calData.events ?? []);
    });
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch(`/api/schedule?date=${selectedDate}&sort=${sortBy}`).then((r) => r.json()),
      fetch(`/api/calendar?${calRangeFor(selectedDate)}`).then((r) => r.json()),
    ])
      .then(([taskData, eventData, calData]) => {
        setTasks(taskData.tasks ?? []);
        setEvents(eventData.events ?? []);
        setCalEvents(calData.events ?? []); // silently empty if no account connected
      })
      .finally(() => setLoading(false));
  }, [sortBy, selectedDate]);

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
    <div className="flex flex-col flex-1 min-h-0 w-full">
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

      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { href: "/tasks", label: "Tasks" },
            { href: "/notes", label: "Notes" },
            { href: "/reminders", label: "Reminders" },
            { href: "/emails", label: "Emails", badge: unreadEmailCount },
            { href: "/calendar", label: "Calendar" },
            { href: "/weather", label: "Weather" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 bg-neutral-900 text-neutral-300 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5"
            >
              {item.label}
              {!!item.badge && (
                <span className="bg-amber-400 text-neutral-950 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-semibold">
                  {item.badge}
                </span>
              )}
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
                calEvents={calEvents}
                onToggleTask={toggleTask}
              />
            ) : (
              <>
                <Schedule
                  events={events}
                  calEvents={calEvents}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onReload={reload}
                  selectedDate={selectedDate}
                  onDateChange={(date) => {
                    if (isCompleteDateString(date)) setSelectedDate(date);
                  }}
                  onEdit={(e) => setEditingEvent(e)}
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
          defaultDate={selectedDate}
          onCreated={reload}
          onClose={() => setShowAddEvent(false)}
        />
      )}

      {editingEvent && (
        <AddEventForm
          defaultDate={selectedDate}
          editingEvent={editingEvent}
          onCreated={reload}
          onClose={() => setEditingEvent(null)}
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
  const [weekData, setWeekData] = useState<
    { date: string; total: number; done: number; pct: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats/productivity")
      .then((r) => r.json())
      .then((data) => setWeekData(data.days ?? []))
      .finally(() => setLoading(false));
  }, []);

  const weekAvg =
    weekData.length > 0
      ? Math.round(weekData.reduce((s, d) => s + d.pct, 0) / weekData.length)
      : 0;

  return (
    <div className="space-y-4">
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
      </div>

      <div className="bg-neutral-900 rounded-2xl p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs uppercase text-neutral-500 font-medium">
            Last 7 Days
          </h3>
          <span className="text-xs text-neutral-500">Avg {weekAvg}%</span>
        </div>
        {loading ? (
          <p className="text-neutral-500 text-sm text-center py-4">Loading…</p>
        ) : (
          <div className="flex items-end justify-between gap-2 h-32">
            {weekData.map((d) => {
              const label = new Date(d.date).toLocaleDateString("en-GB", {
                weekday: "narrow",
              });
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full bg-amber-400 rounded-t-md transition-all"
                      style={{ height: `${Math.max(d.pct, 4)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-500">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MyDay({
  tasks,
  events,
  calEvents,
  onToggleTask,
}: {
  tasks: Task[];
  events: ScheduleEvent[];
  calEvents: { id: string; title: string; start: string; meetLink: string | null }[];
  onToggleTask: (id: string, done: boolean) => void;
}) {
  if (tasks.length === 0 && events.length === 0 && calEvents.length === 0) {
    return (
      <div className="text-neutral-500 text-sm text-center py-8">
        Nothing on your plate today. Ask CeeBee to add something.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {calEvents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase text-neutral-500 font-medium px-1">
            Calendar
          </h3>
          {calEvents.map((e) => (
            <div key={e.id} className="bg-neutral-900 rounded-xl px-4 py-3">
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm">{e.title}</span>
                <span className="text-xs text-neutral-500">
                  {new Date(e.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {e.meetLink && (
                <a
                  href={e.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 text-xs underline mt-1 inline-block"
                >
                  Join meeting
                </a>
              )}
            </div>
          ))}
        </div>
      )}

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
  calEvents,
  sortBy,
  onSortChange,
  onReload,
  selectedDate,
  onDateChange,
  onEdit,
}: {
  events: ScheduleEvent[];
  calEvents: { id: string; title: string; start: string; meetLink: string | null }[];
  sortBy: "time" | "priority";
  onSortChange: (sort: "time" | "priority") => void;
  onReload: () => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onEdit: (event: ScheduleEvent) => void;
}) {
  const [bulkLoading, setBulkLoading] = useState(false);

  async function toggleDone(id: string, done: boolean) {
    await fetch(`/api/schedule/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    onReload();
  }

  async function deleteEvent(id: string, isRecurring: boolean) {
    let scope = "";
    if (isRecurring) {
      const deleteFuture = confirm(
        "This event repeats. OK to delete this and every future occurrence, or Cancel to delete just this one day."
      );
      scope = deleteFuture ? "?scope=series" : "";
    }
    await fetch(`/api/schedule/${id}${scope}`, { method: "DELETE" });
    onReload();
  }

  async function bulkAction(action: "clear" | "unclear") {
    setBulkLoading(true);
    await fetch("/api/schedule/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: selectedDate, action }),
    });
    onReload();
    setBulkLoading(false);
  }

  const anyCleared = events.some((e) => e.cleared);
  const anyClearable = events.some((e) => !e.done && !e.cleared);

  return (
    <div className="space-y-3">
      <input
        type="date"
        value={selectedDate}
        onChange={(e) => onDateChange(e.target.value)}
        className="w-full bg-neutral-900 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
      />

      <div className="flex justify-between items-center text-xs">
        {(anyCleared || anyClearable) && (
          <button
            onClick={() => bulkAction(anyCleared ? "unclear" : "clear")}
            disabled={bulkLoading}
            className="bg-amber-400 text-neutral-950 font-medium px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            {anyCleared ? "Unclear Schedule" : "Clear Schedule"}
          </button>
        )}
        <div className="flex gap-2 ml-auto">
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
      </div>

      {calEvents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase text-neutral-500 font-medium px-1">
            Calendar
          </h3>
          {calEvents.map((e) => (
            <div key={e.id} className="bg-neutral-900 rounded-xl px-4 py-3">
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm">{e.title}</span>
                <span className="text-xs text-neutral-500">
                  {new Date(e.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {e.meetLink && (
                <a
                  href={e.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 text-xs underline mt-1 inline-block"
                >
                  Join meeting
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {events.length === 0 && calEvents.length === 0 ? (
        <div className="text-neutral-500 text-sm text-center py-8">
          No events scheduled for this day.
        </div>
      ) : (
        events.map((e) => (
          <div
            key={e.id}
            className={`bg-neutral-900 rounded-xl px-4 py-3 transition-opacity ${
              e.done ? "opacity-40" : e.cleared ? "opacity-30 pointer-events-none" : ""
            }`}
          >
            <div className="flex justify-between items-start gap-2">
              <label className="flex items-start gap-2 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={e.done}
                  disabled={e.cleared}
                  onChange={(ev) => toggleDone(e.id, ev.target.checked)}
                  className="w-4 h-4 accent-amber-400 mt-0.5 shrink-0"
                />
                <span className={`font-medium text-sm ${e.done ? "line-through" : ""}`}>
                  {e.title}
                </span>
                {!!e.recurrence && e.recurrence !== "none" && (
                  <span className="text-[10px] text-neutral-500 bg-neutral-800 rounded-full px-2 py-0.5 shrink-0">
                    Repeats
                  </span>
                )}
              </label>
              <span className="text-xs text-amber-400 font-medium shrink-0">
                P{e.priority}
              </span>
            </div>
            {e.description && (
              <p className="text-xs text-neutral-400 mt-1 ml-6">{e.description}</p>
            )}
            <div className="flex gap-3 mt-2 text-xs text-neutral-500 ml-6 items-center">
              {e.start_time && (
                <span>
                  {e.start_time.slice(0, 5)}
                  {e.end_time && ` - ${e.end_time.slice(0, 5)}`}
                </span>
              )}
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
              {e.remind_before_minutes && <span>Reminder: {e.remind_before_minutes}m before</span>}
              <button onClick={() => onEdit(e)} className="text-neutral-400 ml-auto">
                Edit
              </button>
              <button
                onClick={() => deleteEvent(e.id, !!e.recurrence && e.recurrence !== "none")}
                className="text-neutral-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}