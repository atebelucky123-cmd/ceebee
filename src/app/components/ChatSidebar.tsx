"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Conversation = { id: string; title: string; updated_at: string };

export default function ChatSidebar({
  open,
  onClose,
  activeId,
  onSelect,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  useEffect(() => {
    if (open) {
      fetch("/api/conversations")
        .then((r) => r.json())
        .then((data) => setConversations(data.conversations ?? []));
    }
  }, [open, activeId]);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  function startRename(c: Conversation) {
    setRenamingId(c.id);
    setRenameText(c.title);
  }

  async function submitRename(id: string) {
    const title = renameText.trim();
    setRenamingId(null);
    if (!title) return;

    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  if (!open) return null;

  return (
    <>
      {/* backdrop -- clicking it collapses the sidebar */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <div className="fixed left-0 top-0 bottom-0 w-72 max-w-[80vw] bg-neutral-900 z-50 flex flex-col border-r border-neutral-800">
        <div className="p-3 space-y-2">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full bg-amber-400 text-neutral-950 rounded-full py-2 text-sm font-medium"
          >
            + New chat
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-neutral-800 rounded-full px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-neutral-600 text-xs text-center py-6">
              No chats found.
            </p>
          ) : (
            filtered.map((c) =>
              renamingId === c.id ? (
                <div key={c.id} className="flex items-center gap-1 px-1 py-1">
                  <input
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(c.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    autoFocus
                    className="flex-1 bg-neutral-800 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    onClick={() => submitRename(c.id)}
                    className="text-amber-400 text-xs font-medium px-2 py-1.5"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div
                  key={c.id}
                  className={`group flex items-center rounded-lg ${
                    c.id === activeId ? "bg-neutral-800" : "hover:bg-neutral-800"
                  }`}
                >
                  <button
                    onClick={() => {
                      onSelect(c.id);
                      onClose();
                    }}
                    className={`flex-1 text-left px-3 py-2 text-sm truncate ${
                      c.id === activeId ? "text-amber-400" : "text-neutral-300"
                    }`}
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={() => startRename(c)}
                    aria-label="Rename chat"
                    className="text-neutral-600 hover:text-amber-400 px-2 py-2 shrink-0"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              )
            )
          )}
        </div>

        <div className="p-3 border-t border-neutral-800">
          <Link
            href="/devtools"
            className="flex items-center gap-2 text-neutral-400 text-sm px-2 py-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            Developer Tools
          </Link>
        </div>
      </div>
    </>
  );
}
