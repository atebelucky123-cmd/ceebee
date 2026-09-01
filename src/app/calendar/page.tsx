"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toLocalDateKey } from "@/lib/dateUtils";

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  meetLink: string | null;
};

type CalEventDetails = CalEvent & {
  description: string | null;
  attendees: string[];
};

export default function CalendarPage() {
  const [viewDate, setViewDate] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDay, setSelectedDay] = useState<string>(toLocalDateKey(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  function reload() {
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
  }

  useEffect(reload, [year, month]);

  const eventsByDay: Record<string, CalEvent[]> = {};
  for (const e of events) {
    // e.start is an ISO datetime already in the event's own timezone
    // offset (e.g. "...+01:00"), so slicing the date portion directly is
    // correct here -- no UTC conversion trap like the grid cells have.
    const key = e.start.slice(0, 10);
    (eventsByDay[key] ??= []).push(e);
  }

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = viewDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const selectedEvents = eventsByDay[selectedDay] ?? [];

  async function deleteEvent(id: string) {
    await fetch(`/api/calendar/${id}`, { method: "DELETE" });
    reload();
  }

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
              setSelectedDay(toLocalDateKey(today));
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
            const dateKey = toLocalDateKey(new Date(year, month, day));
            const hasEvents = eventsByDay[dateKey]?.length > 0;
            const isSelected = dateKey === selectedDay;
            const isToday = dateKey === toLocalDateKey(new Date());

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
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs uppercase text-neutral-500 font-medium px-1">
              {new Date(selectedDay).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h3>
            <button
              onClick={() => {
                setEditingEvent(null);
                setShowForm(true);
              }}
              className="bg-amber-400 text-neutral-950 text-xs font-medium px-3 py-1.5 rounded-full"
            >
              + Add Event
            </button>
          </div>
          {loading ? (
            <div className="text-neutral-500 text-sm text-center py-6">Loading…</div>
          ) : error ? (
            <div className="text-neutral-500 text-sm text-center py-6">{error}</div>
          ) : selectedEvents.length === 0 ? (
            <div className="text-neutral-500 text-sm text-center py-6">No events on this day.</div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((e) => (
                <div key={e.id} className="bg-neutral-900 rounded-xl px-4 py-3">
                  <button
                    onClick={() => setDetailsId(e.id)}
                    className="w-full text-left"
                  >
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-neutral-500 mt-1">
                      {new Date(e.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      {" - "}
                      {new Date(e.end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </button>
                  <div className="flex gap-3 mt-2 text-xs">
                    {e.meetLink && (
                      <a
                        href={e.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-400 underline"
                      >
                        Join meeting
                      </a>
                    )}
                    <button
                      onClick={() => setDetailsId(e.id)}
                      className="text-neutral-400"
                    >
                      Details
                    </button>
                    <button
                      onClick={() => {
                        setEditingEvent(e);
                        setShowForm(true);
                      }}
                      className="text-neutral-400 ml-auto"
                    >
                      Edit
                    </button>
                    <button onClick={() => deleteEvent(e.id)} className="text-neutral-600">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <CalendarEventForm
          defaultDate={selectedDay}
          editingEvent={editingEvent}
          onClose={() => setShowForm(false)}
          onSaved={reload}
        />
      )}

      {detailsId && (
        <EventDetailsModal eventId={detailsId} onClose={() => setDetailsId(null)} />
      )}
    </div>
  );
}

// Mirrors Google Calendar's own event-details view: title, full
// date/time, description, location-style meeting link, and attendees --
// fetched from GET /api/calendar/:id, which already returned all of this,
// it just had nowhere to be shown before.
function EventDetailsModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [details, setDetails] = useState<CalEventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/calendar/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setDetails(data.event);
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-lg">Event Details</h2>
          <button onClick={onClose} className="text-neutral-500 text-sm px-2 py-1">
            Close
          </button>
        </div>

        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-6">Loading…</div>
        ) : error || !details ? (
          <div className="text-neutral-500 text-sm text-center py-6">{error || "Couldn't load this event."}</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-base font-semibold">{details.title}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {new Date(details.start).toLocaleString("en-GB", {
                  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
                })}
                {" – "}
                {new Date(details.end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>

            {details.description && (
              <div>
                <div className="text-xs text-neutral-500 uppercase mb-1">Description</div>
                <p className="text-sm text-neutral-300 whitespace-pre-wrap">{details.description}</p>
              </div>
            )}

            {details.meetLink && (
              <div>
                <div className="text-xs text-neutral-500 uppercase mb-1">Meeting link</div>
                <a
                  href={details.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline text-sm break-all"
                >
                  {details.meetLink}
                </a>
              </div>
            )}

            {details.attendees.length > 0 && (
              <div>
                <div className="text-xs text-neutral-500 uppercase mb-1">
                  Attendees ({details.attendees.length})
                </div>
                <ul className="text-sm text-neutral-300 space-y-1">
                  {details.attendees.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarEventForm({
  defaultDate,
  editingEvent,
  onClose,
  onSaved,
}: {
  defaultDate: string;
  editingEvent: CalEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editStart = editingEvent ? new Date(editingEvent.start) : null;
  const editEnd = editingEvent ? new Date(editingEvent.end) : null;

  const [title, setTitle] = useState(editingEvent?.title ?? "");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(
    editStart ? editStart.toTimeString().slice(0, 5) : "09:00"
  );
  const [endTime, setEndTime] = useState(
    editEnd ? editEnd.toTimeString().slice(0, 5) : "10:00"
  );
  const [attendees, setAttendees] = useState("");
  const [meetLink, setMeetLink] = useState(editingEvent?.meetLink ?? "");
  // "generate" lets Google mint a real Meet link tied to this exact event
  // when it's created (the original checkbox behaviour); "paste" skips
  // that and uses whatever link Shina already has.
  const [linkMode, setLinkMode] = useState<"paste" | "generate">(
    editingEvent?.meetLink ? "paste" : "generate"
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

    const startISO = new Date(`${date}T${startTime}:00`).toISOString();
    const endISO = new Date(`${date}T${endTime}:00`).toISOString();
    const attendeeEmails = attendees
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    // Calendar events have no separate "meeting link" field -- a pasted
    // link goes into the description so it's still visible on the event.
    const fullDescription =
      linkMode === "paste" && meetLink
        ? [description, `Meeting link: ${meetLink}`].filter(Boolean).join("\n\n")
        : description;

    try {
      const res = editingEvent
        ? await fetch(`/api/calendar/${editingEvent.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, description: fullDescription || undefined, startTime: startISO, endTime: endISO }),
          })
        : await fetch("/api/calendar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              description: fullDescription || undefined,
              startTime: startISO,
              endTime: endISO,
              attendeeEmails: attendeeEmails.length > 0 ? attendeeEmails : undefined,
              createMeetLink: linkMode === "generate",
            }),
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
      <div className="bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-lg">{editingEvent ? "Edit Event" : "New Event"}</h2>
          <button onClick={onClose} className="text-neutral-500 text-sm px-2 py-1">
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
            placeholder="Description (optional)"
            rows={2}
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          />

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {!editingEvent && (
            <>
              <input
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="Attendee emails, comma-separated (optional)"
                className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />

              <div>
                <label className="text-xs text-neutral-500 block mb-1">Meet link</label>
                <div className="flex bg-neutral-800 rounded-lg p-1 text-xs mb-2">
                  <button
                    type="button"
                    onClick={() => setLinkMode("generate")}
                    className={`flex-1 py-1.5 rounded-md font-medium ${
                      linkMode === "generate" ? "bg-amber-400 text-neutral-950" : "text-neutral-400"
                    }`}
                  >
                    Generate Meet link
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkMode("paste")}
                    className={`flex-1 py-1.5 rounded-md font-medium ${
                      linkMode === "paste" ? "bg-amber-400 text-neutral-950" : "text-neutral-400"
                    }`}
                  >
                    Paste a link
                  </button>
                </div>
                {linkMode === "paste" ? (
                  <input
                    value={meetLink}
                    onChange={(e) => setMeetLink(e.target.value)}
                    placeholder="Paste a meeting link…"
                    className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                  />
                ) : (
                  <p className="text-[11px] text-neutral-600">
                    A Google Meet link will be attached automatically when you save.
                  </p>
                )}
              </div>
            </>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-400 text-neutral-950 rounded-full py-2.5 font-medium text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : editingEvent ? "Save Changes" : "Add Event"}
          </button>
        </form>
      </div>
    </div>
  );
}
