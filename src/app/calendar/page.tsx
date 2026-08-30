"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  meetLink: string | null;
};

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const [viewDate, setViewDate] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDay, setSelectedDay] = useState<string>(toDateKey(new Date()));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  useEffect(() => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 1);
    setLoading(true);
    fetch(`/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setError("");
          setEvents(data.events ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [year, month]);

  const eventsByDay: Record<string, CalEvent[]> = {};
  for (const e of events) {
    const key = e.start.slice(0, 10);
    (eventsByDay[key] ??= []).push(e);
  }

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = viewDate.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const selectedEvents = eventsByDay[selectedDay] ?? [];

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="bg-amber-400 text-neutral-950 text-xs font-medium px-3 py-1.5 rounded-full"
        >
          Back
        </Link>
        <h1 className="font-semibold text-lg">Calendar</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="bg-neutral-900 text-neutral-300 text-xs font-medium px-3 py-1.5 rounded-full"
          >
            Prev
          </button>
          <div className="text-sm font-medium">{monthLabel}</div>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="bg-neutral-900 text-neutral-300 text-xs font-medium px-3 py-1.5 rounded-full"
          >
            Next
          </button>
        </div>

        <div className="flex justify-center gap-2">
          <button
            onClick={() => {
              const today = new Date();
              setViewDate(today);
              setSelectedDay(toDateKey(today));
            }}
            className="bg-amber-400 text-neutral-950 text-xs font-medium px-3 py-1.5 rounded-full"
          >
            Today
          </button>
          <button
            onClick={() => setViewDate(new Date(year - 1, month, 1))}
            className="bg-neutral-900 text-neutral-400 text-xs px-3 py-1.5 rounded-full"
          >
            Prev Year
          </button>
          <button
            onClick={() => setViewDate(new Date(year + 1, month, 1))}
            className="bg-neutral-900 text-neutral-400 text-xs px-3 py-1.5 rounded-full"
          >
            Next Year
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-neutral-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const dateKey = toDateKey(new Date(year, month, day));
            const hasEvents = eventsByDay[dateKey]?.length > 0;
            const isSelected = dateKey === selectedDay;
            const isToday = dateKey === toDateKey(new Date());

            return (
              <button
                key={i}
                onClick={() => setSelectedDay(dateKey)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative ${
                  isSelected
                    ? "bg-amber-400 text-neutral-950 font-semibold"
                    : isToday
                    ? "bg-neutral-800 text-amber-400"
                    : "bg-neutral-900 text-neutral-300"
                }`}
              >
                {day}
                {hasEvents && !isSelected && (
                  <span className="w-1 h-1 rounded-full bg-amber-400 absolute bottom-1" />
                )}
              </button>
            );
          })}
        </div>

        <div>
          <h3 className="text-xs uppercase text-neutral-500 font-medium px-1 mb-2">
            {new Date(selectedDay).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h3>
          {loading ? (
            <div className="text-neutral-500 text-sm text-center py-6">
              Loading…
            </div>
          ) : error ? (
            <div className="text-neutral-500 text-sm text-center py-6">
              {error}
            </div>
          ) : selectedEvents.length === 0 ? (
            <div className="text-neutral-500 text-sm text-center py-6">
              No events on this day.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((e) => (
                <div key={e.id} className="bg-neutral-900 rounded-xl px-4 py-3">
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {new Date(e.start).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
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
        </div>
      </main>
    </div>
  );
}
