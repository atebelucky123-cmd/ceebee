"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Task = {
  id: string;
  title: string;
  due_date: string | null;
  done: boolean;
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);

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
      body: JSON.stringify({ title }),
    });
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

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link href="/dashboard" className="text-neutral-500 text-sm">
          ← Back
        </Link>
        <h1 className="font-semibold text-lg">Tasks</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4">
        <form onSubmit={addTask} className="flex gap-2">
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
            {tasks.map((t) => (
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
                <span
                  className={`text-sm flex-1 ${
                    t.done ? "line-through text-neutral-500" : ""
                  }`}
                >
                  {t.title}
                </span>
                <button
                  onClick={() => deleteTask(t.id)}
                  className="text-neutral-600 text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
