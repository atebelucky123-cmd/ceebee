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
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate ${
                  c.id === activeId
                    ? "bg-neutral-800 text-amber-400"
                    : "text-neutral-300 hover:bg-neutral-800"
                }`}
              >
                {c.title}
              </button>
            ))
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
