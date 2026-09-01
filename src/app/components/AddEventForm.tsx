"use client";

import { useState } from "react";
import { RECURRENCE_OPTIONS, WEEKDAY_LABELS, type Recurrence } from "@/lib/recurrence";

const REMIND_OPTIONS = [
  { label: "Don't remind me", value: "" },
  { label: "5 minutes before", value: "5" },
  { label: "10 minutes before", value: "10" },
  { label: "30 minutes before", value: "30" },
  { label: "1 hour before", value: "60" },
];

type ScheduleEventLike = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  meeting_link: string | null;
  priority: number;
  remind_before_minutes: number | null;
  recurrence?: Recurrence;
  recurrence_days?: number[] | null;
};

export default function AddEventForm({
  defaultDate,
  editingEvent,
  onCreated,
  onClose,
}: {
  defaultDate: string;
  editingEvent?: ScheduleEventLike | null;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(editingEvent?.title ?? "");
  const [description, setDescription] = useState(editingEvent?.description ?? "");
  const [eventDate, setEventDate] = useState(editingEvent?.event_date ?? defaultDate);
  const [startTime, setStartTime] = useState(editingEvent?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(editingEvent?.end_time?.slice(0, 5) ?? "");
  const [meetingLink, setMeetingLink] = useState(editingEvent?.meeting_link ?? "");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [priority, setPriority] = useState(editingEvent?.priority ?? 3);
  const [remindBefore, setRemindBefore] = useState(
    editingEvent?.remind_before_minutes ? String(editingEvent.remind_before_minutes) : ""
  );
  const [recurrence, setRecurrence] = useState<Recurrence>(editingEvent?.recurrence ?? "none");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(editingEvent?.recurrence_days ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Editing an occurrence that's already part of a series only edits that
  // one row (see the API route) -- surface that so it's not surprising.
  const isExistingSeriesOccurrence =
    !!editingEvent && !!editingEvent.recurrence && editingEvent.recurrence !== "none";

  function toggleDay(day: number) {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function generateMeetLink() {
    setGeneratingLink(true);
    setError("");
    try {
      const res = await fetch("/api/meet-link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate a Meet link.");
        return;
      }
      setMeetingLink(data.meetLink);
    } catch {
      setError("Couldn't reach the server to generate a link.");
    } finally {
      setGeneratingLink(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the event a title.");
      return;
    }
    if (recurrence === "custom" && recurrenceDays.length === 0) {
      setError("Pick at least one day for a custom repeat.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      title,
      description: description || null,
      event_date: eventDate,
      start_time: startTime || null,
      end_time: endTime || null,
      meeting_link: meetingLink || null,
      priority,
      remind_before_minutes: remindBefore ? Number(remindBefore) : null,
      recurrence,
      recurrence_days: recurrence === "custom" ? recurrenceDays : null,
    };

    try {
      const res = editingEvent
        ? await fetch(`/api/schedule/${editingEvent.id}`, {
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

      onCreated();
      onClose();
    } catch {
      setError("Couldn't reach the server. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-lg">{editingEvent ? "Edit Event" : "New Event"}</h2>
          <button
            onClick={onClose}
            className="text-neutral-500 text-sm px-2 py-1"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            autoFocus
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            rows={2}
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          />

          <div>
            <label className="text-xs text-neutral-500 block mb-1">
              Date {recurrence !== "none" ? "(first occurrence)" : ""}
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">
                From (optional)
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">
                To (optional)
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Repeats</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            >
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {isExistingSeriesOccurrence && (
              <p className="text-[10px] text-neutral-600 mt-1">
                Changing this only affects this one occurrence, not the rest of the series.
              </p>
            )}
            {recurrence === "custom" && (
              <div className="flex gap-1.5 mt-2">
                {WEEKDAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium ${
                      recurrenceDays.includes(day)
                        ? "bg-amber-400 text-neutral-950"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">
              Meeting link (optional)
            </label>
            <div className="flex gap-2">
              <input
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="Paste a link…"
                className="flex-1 bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                type="button"
                onClick={generateMeetLink}
                disabled={generatingLink}
                className="bg-neutral-800 text-amber-400 text-xs font-medium px-3 rounded-lg disabled:opacity-50 shrink-0"
              >
                {generatingLink ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">
              Priority: {priority}
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-neutral-600">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">
              Remind me
            </label>
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
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-400 text-neutral-950 rounded-full py-2.5 font-medium text-sm disabled:opacity-50 mt-2"
          >
            {saving ? "Saving…" : editingEvent ? "Save Changes" : "Add Event"}
          </button>
        </form>
      </div>
    </div>
  );
}
