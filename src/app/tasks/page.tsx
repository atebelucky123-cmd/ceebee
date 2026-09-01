"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Task = {
  id: string;
  title: string;
  due_date: string | null;
  start_time: string | null;
  end_time: string | null;
  done: boolean;
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [showTimeFields, setShowTimeFields] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  function load() {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((data) => setTasks(data.tasks ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const title = newTitle;
    setNewTitle("");
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        start_time: startTime || null,
        end_time: endTime || null,
      }),
    });
    setStartTime("");
    setEndTime("");
    setShowTimeFields(false);
    load();
  }

  async function toggleTask(id: string, done: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditStart(t.start_time?.slice(0, 5) ?? "");
    setEditEnd(t.end_time?.slice(0, 5) ?? "");
  }

  async function saveEdit(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        start_time: editStart || null,
        end_time: editEnd || null,
      }),
    });
    setEditingId(null);
    load();
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
        <h1 className="font-semibold text-lg">Tasks</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4">
        <form onSubmit={addTask} className="space-y-2">
          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add a task…"
              className="flex-1 bg-neutral-900 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              className="bg-amber-400 text-neutral-950 rounded-full px-5 py-2.5 text-sm font-medium"
            >
              Add
            </button>
          </div>

          {!showTimeFields ? (
            <button
              type="button"
              onClick={() => setShowTimeFields(true)}
              className="text-amber-400 text-xs font-medium"
            >
              + Add time (optional)
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 bg-neutral-900 rounded-xl p-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">
                  From
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-neutral-800 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">
                  To
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-neutral-800 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
          )}
        </form>

        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            No tasks yet.
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) =>
              editingId === t.id ? (
                <div key={t.id} className="bg-neutral-900 rounded-xl px-4 py-3 space-y-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                    className="w-full bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                      className="w-full bg-neutral-800 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <input
                      type="time"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                      className="w-full bg-neutral-800 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(t.id)}
                      className="bg-amber-400 text-neutral-950 text-xs font-medium px-4 py-1.5 rounded-full"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="bg-neutral-800 text-neutral-300 text-xs px-4 py-1.5 rounded-full"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={t.id}
                  className="flex items-center gap-3 bg-neutral-900 rounded-xl px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={(e) => toggleTask(t.id, e.target.checked)}
                    className="w-4 h-4 accent-amber-400"
                  />
                  <button
                    onClick={() => startEdit(t)}
                    className="flex-1 text-left"
                  >
                    <span
                      className={`text-sm ${
                        t.done ? "line-through text-neutral-500" : ""
                      }`}
                    >
                      {t.title}
                    </span>
                    {(t.start_time || t.end_time) && (
                      <div className="text-xs text-neutral-500">
                        {t.start_time?.slice(0, 5)}
                        {t.end_time && ` - ${t.end_time.slice(0, 5)}`}
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => deleteTask(t.id)}
                    className="text-neutral-600 text-xs"
                  >
                    Remove
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
