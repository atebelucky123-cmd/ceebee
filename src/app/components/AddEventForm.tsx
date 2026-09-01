"use client";

import { useState } from "react";

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
  const [priority, setPriority] = useState(editingEvent?.priority ?? 3);
  const [remindBefore, setRemindBefore] = useState(
    editingEvent?.remind_before_minutes ? String(editingEvent.remind_before_minutes) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the event a title.");
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">
                Date
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div />
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

          <input
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="Meeting link (optional)"
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />

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
