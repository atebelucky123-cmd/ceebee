"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DatePicker from "../components/DatePicker";

type ScheduleEvent = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  remind_before_minutes: number | null;
};

const REMIND_OPTIONS = [
  { label: "Right when it starts", value: "0" },
  { label: "5 minutes before", value: "5" },
  { label: "10 minutes before", value: "10" },
  { label: "30 minutes before", value: "30" },
  { label: "1 hour before", value: "60" },
];

export default function RemindersPage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);

  function load() {
    fetch("/api/schedule?sort=time")
      .then((r) => r.json())
      .then((data) => {
        // BUG FIX: this used to be `.filter((e) => e.remind_before_minutes)`,
        // a truthy check -- which silently excluded any reminder set to
        // fire exactly at start time (remind_before_minutes: 0), since 0 is
        // falsy in JS. That's exactly the value CeeBee sets by default when
        // you just say "remind me" without specifying how far in advance,
        // so those reminders were created successfully but never showed up
        // here. This now checks for "has a value at all", not "is truthy".
        const withReminders = (data.events ?? []).filter(
          (e: ScheduleEvent) => e.remind_before_minutes !== null && e.remind_before_minutes !== undefined
        );
        setEvents(withReminders);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function deleteReminder(id: string) {
    await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="bg-amber-400 text-neutral-950 text-xs font-medium px-3 py-1.5 rounded-full"
        >
          Back
        </Link>
        <h1 className="font-semibold text-lg">Reminders</h1>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="w-full bg-amber-400 text-neutral-950 rounded-full py-2.5 font-medium text-sm"
        >
          + Add Reminder
        </button>

        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-8">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            No reminders set.
          </div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="bg-neutral-900 rounded-xl px-4 py-3">
              <div className="text-sm font-medium">{e.title}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {e.event_date}
                {e.start_time ? ` at ${e.start_time.slice(0, 5)}` : ""} — reminder{" "}
                {e.remind_before_minutes === 0
                  ? "right when it starts"
                  : `${e.remind_before_minutes} min before`}
              </div>
              <div className="flex gap-3 mt-2 text-xs">
                <button
                  onClick={() => {
                    setEditing(e);
                    setShowForm(true);
                  }}
                  className="text-neutral-400"
                >
                  Edit
                </button>
                <button onClick={() => deleteReminder(e.id)} className="text-neutral-600">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </main>

      {showForm && (
        <ReminderForm
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ReminderForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: ScheduleEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing?.event_date ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(editing?.start_time?.slice(0, 5) ?? "");
  const [remindBefore, setRemindBefore] = useState(
    // Was defaulting to "10" even for a brand-new reminder with no chosen
    // value yet -- editing?.remind_before_minutes could legitimately be 0,
    // and `0 ? String(0) : "10"` would wrongly fall through to "10" there
    // too. Checked for null/undefined explicitly instead.
    editing?.remind_before_minutes !== null && editing?.remind_before_minutes !== undefined
      ? String(editing.remind_before_minutes)
      : "10"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the reminder a title.");
      return;
    }
    setSaving(true);
    setError("");

    // Reminders are lightweight schedule_events -- just title, date, time,
    // and a reminder offset, without the full event form's extra fields.
    const payload = {
      title,
      event_date: date,
      start_time: time || null,
      priority: 3,
      remind_before_minutes: Number(remindBefore),
    };

    try {
      const res = editing
        ? await fetch(`/api/schedule/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong.");
        setSaving(false);
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError("Couldn't reach the server.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-lg">{editing ? "Edit Reminder" : "New Reminder"}</h2>
          <button onClick={onClose} className="text-neutral-500 text-sm px-2 py-1">
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Remind me about…"
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <DatePicker value={date} onChange={setDate} />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <select
            value={remindBefore}
            onChange={(e) => setRemindBefore(e.target.value)}
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          >
            {REMIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-400 text-neutral-950 rounded-full py-2.5 font-medium text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Reminder"}
          </button>
        </form>
      </div>
    </div>
  );
}
