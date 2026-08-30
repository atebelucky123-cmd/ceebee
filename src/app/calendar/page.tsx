"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  meetLink: string | null;
  attendees: string[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/calendar?hoursAhead=336") // next 14 days
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setEvents(data.events ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

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

      <main className="flex-1 px-4 py-4 space-y-2">
        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : error ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            No events in the next two weeks.
          </div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="bg-neutral-900 rounded-xl px-4 py-3">
              <div className="text-sm font-medium">{e.title}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {formatDate(e.start)}
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
          ))
        )}
      </main>
    </div>
  );
}
