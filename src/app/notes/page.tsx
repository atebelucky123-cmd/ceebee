"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Note = {
  id: string;
  title: string | null;
  body: string;
  updated_at: string;
};

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/notes")
      .then((r) => r.json())
      .then((data) => setNotes(data.notes ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || null, body }),
    });
    setTitle("");
    setBody("");
    load();
  }

  async function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link href="/dashboard" className="text-neutral-500 text-sm">
          ← Back
        </Link>
        <h1 className="font-semibold text-lg">Notes</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4">
        <form onSubmit={addNote} className="space-y-2 bg-neutral-900 rounded-xl p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-neutral-600"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a note…"
            rows={3}
            className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-neutral-600"
          />
          <button
            type="submit"
            className="bg-amber-400 text-neutral-950 rounded-full px-4 py-1.5 text-xs font-medium"
          >
            Save note
          </button>
        </form>

        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : notes.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            No notes yet.
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="bg-neutral-900 rounded-xl p-3">
                <div className="flex justify-between items-start">
                  {n.title && (
                    <h3 className="font-medium text-sm mb-1">{n.title}</h3>
                  )}
                  <button
                    onClick={() => deleteNote(n.id)}
                    className="text-neutral-600 text-xs shrink-0"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-sm text-neutral-300 whitespace-pre-wrap">
                  {n.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
