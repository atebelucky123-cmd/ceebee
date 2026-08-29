"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ScheduleEvent = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  remind_before_minutes: number | null;
};

export default function RemindersPage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/schedule?sort=time")
      .then((r) => r.json())
      .then((data) => {
        const withReminders = (data.events ?? []).filter(
          (e: ScheduleEvent) => e.remind_before_minutes
        );
        setEvents(withReminders);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link href="/dashboard" className="text-neutral-500 text-sm">
          ← Back
        </Link>
        <h1 className="font-semibold text-lg">Reminders</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-2">
        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            No reminders set. Add one when creating an event on your
            Schedule.
          </div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="bg-neutral-900 rounded-xl px-4 py-3">
              <div className="text-sm font-medium">{e.title}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {e.event_date}
                {e.start_time ? ` at ${e.start_time.slice(0, 5)}` : ""} —
                reminder {e.remind_before_minutes} min before
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
