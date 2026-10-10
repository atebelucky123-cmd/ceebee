"use client";

import { useEffect, useState } from "react";
import AddEventForm from "../AddEventForm";
import DatePicker from "../DatePicker";
import PriorityPill from "./Priority";
import { BellIcon, ChevronDownIcon, VideoIcon } from "../Icons";

export type ScheduleEvent = {
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

type CalEvent = { id: string; title: string; start: string; end: string; meetLink: string | null };

export function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Native date inputs fire onChange with "" mid-edit; only accept complete,
// valid YYYY-MM-DD values (an invalid one used to crash the page).
const FULL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isCompleteDateString(value: string): boolean {
  return FULL_DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function calRangeFor(dateStr: string) {
  const safe = isCompleteDateString(dateStr) ? dateStr : todayISO();
  const start = new Date(`${safe}T00:00:00`);
  const end = new Date(`${safe}T23:59:59`);
  return `start=${start.toISOString()}&end=${end.toISOString()}`;
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// The Schedule section of Today: Shina's personal day list for any date,
// with her Google Calendar events for that day alongside.
export default function ScheduleManager({
  refreshKey = 0,
  onChanged,
  bare = false,
}: {
  refreshKey?: number;
  onChanged?: () => void;
  bare?: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [sortBy, setSortBy] = useState<"time" | "priority" | "custom">("time");
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  // Loading = the data on screen is for a different request than the one
  // wanted now (derived, rather than toggled inside the fetch effect).
  const requestKey = `${selectedDate}|${sortBy}|${refreshKey}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);
  const [localKey, setLocalKey] = useState(0);
  const loading = loadedKey !== `${requestKey}|${localKey}`;

  useEffect(() => {
    let cancelled = false;
    const key = `${selectedDate}|${sortBy}|${refreshKey}|${localKey}`;
    Promise.all([
      fetch(`/api/schedule?date=${selectedDate}&sort=${sortBy}`).then((r) => r.json()),
      fetch(`/api/calendar?${calRangeFor(selectedDate)}`).then((r) => r.json()).catch(() => ({})),
    ])
      .then(([eventData, calData]) => {
        if (cancelled) return;
        setEvents(eventData.events ?? []);
        setCalEvents(calData.events ?? []); // silently empty if no account connected
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setCalEvents([]);
        }
      })
      .finally(() => !cancelled && setLoadedKey(key));
    return () => {
      cancelled = true;
    };
  }, [selectedDate, sortBy, refreshKey, localKey]);

  function reload() {
    setLocalKey((k) => k + 1);
    onChanged?.();
  }

  async function toggleDone(id: string, done: boolean) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, done } : e)));
    await fetch(`/api/schedule/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    reload();
  }

  async function deleteEvent(id: string, isRecurring: boolean) {
    let scope = "";
    if (isRecurring) {
      const deleteFuture = confirm(
        "This event repeats. OK to delete this and every future occurrence, or Cancel to delete just this one day."
      );
      scope = deleteFuture ? "?scope=series" : "";
    } else if (!confirm("Delete this from your schedule?")) {
      return;
    }
    await fetch(`/api/schedule/${id}${scope}`, { method: "DELETE" });
    reload();
  }

  // Custom order: swap with the neighbour, show it immediately, then save.
  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= events.length) return;
    const next = [...events];
    [next[index], next[target]] = [next[target], next[index]];
    setEvents(next);
    setReorderError(null);
    const res = await fetch("/api/schedule/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: selectedDate, ids: next.map((e) => e.id) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setReorderError(data.error ?? "Couldn't save that order.");
      setLocalKey((k) => k + 1);
    }
  }

  async function bulkAction(action: "clear" | "unclear") {
    setBulkLoading(true);
    await fetch("/api/schedule/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: selectedDate, action }),
    });
    setBulkLoading(false);
    reload();
  }

  const anyCleared = events.some((e) => e.cleared);
  const anyClearable = events.some((e) => !e.done && !e.cleared);

  return (
    <section
      className={`flex flex-col gap-3.5 min-h-0 ${bare ? "" : "bg-surface border border-line rounded-[20px] px-6 py-[22px]"}`}
    >
      <div className="flex justify-between items-center gap-3">
        <h2 className="text-[17px] font-bold">Schedule</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="h-9 px-3.5 rounded-[10px] border border-outline text-[13px] font-semibold hover:border-muted"
        >
          + Add event
        </button>
      </div>

      <DatePicker value={selectedDate} onChange={(d) => isCompleteDateString(d) && setSelectedDate(d)} />

      <div className="flex justify-between items-center gap-2 text-xs flex-wrap">
        {(anyCleared || anyClearable) && (
          <button
            onClick={() => bulkAction(anyCleared ? "unclear" : "clear")}
            disabled={bulkLoading}
            className="border border-outline text-soft font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            {anyCleared ? "Unclear day" : "Clear day"}
          </button>
        )}
        <div className="flex gap-1.5 ml-auto items-center" role="group" aria-label="Sort schedule">
          <span className="text-muted mr-1">Sort</span>
          {(["time", "priority", "custom"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setSortBy(opt)}
              aria-pressed={sortBy === opt}
              className={`px-3 py-1 rounded-full capitalize font-semibold ${
                sortBy === opt ? "bg-cream text-ground" : "border border-line-strong text-muted"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {reorderError && <p className="text-[13px] text-ember">{reorderError}</p>}
      {sortBy === "custom" && !reorderError && events.length > 1 && (
        <p className="text-xs text-muted">Use the arrows to set your order. Repeating items keep it on future days.</p>
      )}

      <div className="flex flex-col overflow-y-auto min-h-0 -mx-1 px-1">
        {loading ? (
          <div className="flex flex-col gap-3 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-xl bg-raised animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 && calEvents.length === 0 ? (
          <div className="text-muted text-sm text-center py-8">Nothing scheduled. Ask CeeBee or add an event.</div>
        ) : (
          <>
            {calEvents.map((e) => (
              <div key={e.id} className="flex gap-4 items-center py-3 border-b border-line">
                <span className="font-mono text-[13px] w-12 shrink-0 text-honey">{hhmm(e.start)}</span>
                <span className="flex-1 min-w-0 text-[15px] truncate">{e.title}</span>
                {e.meetLink ? (
                  <a
                    href={e.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-semibold text-honey"
                  >
                    <VideoIcon size={14} /> Meet
                  </a>
                ) : (
                  <span className="text-xs text-muted">Calendar</span>
                )}
              </div>
            ))}
            {events.map((e, index) => {
              const recurring = !!e.recurrence && e.recurrence !== "none";
              return (
                <div
                  key={e.id}
                  className={`group py-3 border-b border-line last:border-b-0 ${e.cleared ? "opacity-40" : ""}`}
                >
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={e.done}
                        disabled={e.cleared}
                        onChange={(ev) => toggleDone(e.id, ev.target.checked)}
                        className="sr-only peer"
                      />
                      <span
                        className={`font-mono text-[13px] w-12 shrink-0 ${e.done ? "text-muted" : "text-muted peer-focus-visible:text-honey"}`}
                      >
                        {e.start_time?.slice(0, 5) ?? "—"}
                      </span>
                      <span className={`flex-1 min-w-0 text-[15px] truncate ${e.done ? "line-through text-muted" : e.priority >= 5 ? "font-semibold" : ""}`}>
                        {e.title}
                        {recurring && <span className="text-muted font-normal"> · repeats</span>}
                      </span>
                    </label>
                    {e.done ? <span className="text-xs text-muted">Done</span> : <PriorityPill priority={e.priority} />}
                    {sortBy === "custom" && (
                      <span className="flex gap-1 shrink-0">
                        <button
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${e.title} up`}
                          className="w-8 h-8 rounded-lg border border-line-strong flex items-center justify-center text-soft hover:text-honey disabled:opacity-30"
                        >
                          <ChevronDownIcon size={16} className="rotate-180" />
                        </button>
                        <button
                          onClick={() => move(index, 1)}
                          disabled={index === events.length - 1}
                          aria-label={`Move ${e.title} down`}
                          className="w-8 h-8 rounded-lg border border-line-strong flex items-center justify-center text-soft hover:text-honey disabled:opacity-30"
                        >
                          <ChevronDownIcon size={16} />
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1.5 ml-16 text-xs text-muted items-center flex-wrap">
                    {e.end_time && <span className="font-mono">until {e.end_time.slice(0, 5)}</span>}
                    {e.remind_before_minutes !== null && (
                      <span className="inline-flex items-center gap-1">
                        <BellIcon size={13} className="text-honey" />
                        {e.remind_before_minutes === 0 ? "at start" : `${e.remind_before_minutes}m before`}
                      </span>
                    )}
                    {e.meeting_link && (
                      <a href={e.meeting_link} target="_blank" rel="noopener noreferrer" className="text-honey font-semibold">
                        Join
                      </a>
                    )}
                    {e.description && <span className="truncate max-w-[16rem]">{e.description}</span>}
                    <span className="ml-auto flex gap-3">
                      <button onClick={() => toggleDone(e.id, !e.done)} disabled={e.cleared} className="hover:text-cream">
                        {e.done ? "Undo" : "Done"}
                      </button>
                      <button onClick={() => setEditing(e)} className="hover:text-cream">
                        Edit
                      </button>
                      <button onClick={() => deleteEvent(e.id, recurring)} className="hover:text-ember">
                        Delete
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {showAdd && <AddEventForm defaultDate={selectedDate} onCreated={reload} onClose={() => setShowAdd(false)} />}
      {editing && (
        <AddEventForm defaultDate={selectedDate} editingEvent={editing} onCreated={reload} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
