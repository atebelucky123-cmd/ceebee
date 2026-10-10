"use client";

import { useEffect, useState } from "react";
import { PlusIcon, SearchIcon, CloseIcon } from "./Icons";

type Conversation = { id: string; title: string; updated_at: string; preview: string | null };

function groupLabel(iso: string): "TODAY" | "THIS WEEK" | "EARLIER" {
  const then = new Date(iso);
  const now = new Date();
  if (then.toDateString() === now.toDateString()) return "TODAY";
  if (now.getTime() - then.getTime() < 7 * 24 * 60 * 60 * 1000) return "THIS WEEK";
  return "EARLIER";
}

// "Chats" -- the conversation list. Renders as a permanent column on desktop
// (`docked`) and as a slide-over drawer on mobile.
export default function ChatSidebar({
  open,
  docked,
  onClose,
  activeId,
  onSelect,
  onNewChat,
}: {
  open: boolean;
  docked?: boolean;
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
    if (!open && !docked) return;
    const load = () =>
      fetch("/api/conversations")
        .then((r) => r.json())
        .then((data) => setConversations(data.conversations ?? []))
        .catch(() => {});
    load();
    // useCeeBeeChat fires this after each reply / once the AI title lands.
    window.addEventListener("ceebee:conversations-changed", load);
    return () => window.removeEventListener("ceebee:conversations-changed", load);
  }, [open, docked, activeId]);

  const q = search.toLowerCase();
  const filtered = conversations.filter(
    (c) => c.title.toLowerCase().includes(q) || (c.preview ?? "").toLowerCase().includes(q)
  );

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

  if (!open && !docked) return null;

  let lastGroup = "";
  const list = (
    <div className="flex flex-col gap-3.5 h-full min-h-0">
      <div className="flex justify-between items-center px-2">
        <h2 className="font-display font-extrabold text-2xl">Chats</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            aria-label="New chat"
            className="w-10 h-10 rounded-xl bg-honey text-ground flex items-center justify-center"
          >
            <PlusIcon />
          </button>
          {!docked && (
            <button onClick={onClose} aria-label="Close chats" className="w-10 h-10 rounded-xl text-muted flex items-center justify-center">
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 h-[42px] px-3 rounded-xl bg-surface border border-line-strong text-muted focus-within:border-outline">
        <SearchIcon size={18} />
        <span className="sr-only">Search chats</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chats"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-cream placeholder:text-muted"
        />
      </label>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 -mx-1 px-1">
        {filtered.length === 0 ? (
          <p className="text-muted text-sm text-center py-6">{search ? "No chats found." : "No chats yet."}</p>
        ) : (
          filtered.map((c) => {
            const group = groupLabel(c.updated_at);
            const header =
              group !== lastGroup ? (
                <div key={`h-${group}`} className="text-xs font-semibold tracking-[0.06em] text-muted px-2 pt-2.5 pb-1">
                  {group}
                </div>
              ) : null;
            lastGroup = group;
            const active = c.id === activeId;

            if (renamingId === c.id) {
              return (
                <div key={c.id}>
                  {header}
                  <div className="flex items-center gap-1 p-1">
                    <input
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(c.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      autoFocus
                      aria-label="Chat name"
                      className="flex-1 bg-raised rounded-lg px-2 py-2 text-sm outline-none border border-honey"
                    />
                    <button onClick={() => submitRename(c.id)} className="text-honey text-xs font-semibold px-2 py-2">
                      Save
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={c.id}>
                {header}
                <div className={`group flex items-start rounded-xl ${active ? "bg-raised" : "hover:bg-surface"}`}>
                  <button
                    onClick={() => {
                      onSelect(c.id);
                      onClose();
                    }}
                    className="flex-1 min-w-0 text-left flex flex-col gap-0.5 p-3"
                  >
                    <span className={`text-[15px] truncate ${active ? "font-semibold" : "font-medium"}`}>{c.title}</span>
                    {c.preview && <span className="text-[13px] text-muted truncate">{c.preview}</span>}
                  </button>
                  <button
                    onClick={() => {
                      setRenamingId(c.id);
                      setRenameText(c.title);
                    }}
                    aria-label={`Rename ${c.title}`}
                    className="text-muted hover:text-honey p-3 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (docked) {
    return (
      <aside aria-label="Conversations" className="hidden lg:flex w-[300px] shrink-0 flex-col border-r border-line bg-aside px-4 py-6 min-h-0">
        {list}
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Conversations">
      <button aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-[320px] max-w-[85vw] bg-aside border-l border-line px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 flex flex-col">
        {list}
      </div>
    </div>
  );
}
