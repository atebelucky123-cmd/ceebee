"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import ChatSidebar from "../components/ChatSidebar";

type Message = { role: "user" | "model"; text: string; time: string };

function nowISO() {
  return new Date().toISOString();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 5 * 24;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input]);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const res = await fetch("/api/conversations", { method: "POST" });
    const data = await res.json();
    setConversationId(data.conversation.id);
    return data.conversation.id;
  }

  async function loadConversation(id: string) {
    setConversationId(id);
    const res = await fetch(`/api/conversations/${id}/messages`);
    const data = await res.json();
    setMessages(
      (data.messages ?? []).map((m: { role: string; content: string; created_at: string }) => ({
        role: m.role,
        text: m.content,
        time: m.created_at,
      }))
    );
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
  }

  // Sends `historyBefore` + `text` to Gemini and appends the reply. Shared
  // by normal sending, "regenerate", and "edit + resend".
  async function requestReply(text: string, historyBefore: Message[]) {
    setLoading(true);
    const convId = await ensureConversation();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyBefore.map((m) => ({
            role: m.role,
            parts: [{ text: m.text }],
          })),
        }),
      });
      const data = await res.json();
      const replyText = res.ok ? data.reply : `⚠️ ${data.error}`;
      const replyMsg: Message = { role: "model", text: replyText, time: nowISO() };
      setMessages((prev) => [...prev, replyMsg]);
      await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "model", content: replyText }),
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "model", text: "⚠️ Couldn't reach CeeBee. Check your connection.", time: nowISO() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", text, time: nowISO() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");

    const convId = await ensureConversation();
    await fetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: text }),
    });
    if (messages.length === 0) {
      await fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text.slice(0, 40) }),
      });
    }

    await requestReply(text, messages);
  }

  function copyMessage(text: string, index: number) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  }

  // Regenerate: re-ask using the same preceding history, replacing this
  // model reply with a new one.
  async function regenerate(index: number) {
    if (loading) return;
    const historyBefore = messages.slice(0, index - 1);
    const lastUserMessage = messages[index - 1];
    if (!lastUserMessage || lastUserMessage.role !== "user") return;
    setMessages((prev) => prev.slice(0, index));
    await requestReply(lastUserMessage.text, historyBefore);
  }

  function startEdit(index: number, text: string) {
    setEditingIndex(index);
    setEditText(text);
  }

  async function submitEdit(index: number) {
    const text = editText.trim();
    if (!text) return;
    const historyBefore = messages.slice(0, index);
    const editedMsg: Message = { role: "user", text, time: nowISO() };
    setMessages([...historyBefore, editedMsg]);
    setEditingIndex(null);

    const convId = await ensureConversation();
    await fetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: text }),
    });

    await requestReply(text, historyBefore);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <button onClick={() => setSidebarOpen(true)} className="text-neutral-400" aria-label="Open chat history">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <Image src="/logo.svg" alt="CeeBee" width={32} height={32} className="rounded-full" />
        <h1 className="font-semibold text-lg">CeeBee</h1>
      </header>

      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeId={conversationId}
        onSelect={loadConversation}
        onNewChat={startNewChat}
      />

      <main
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        onClick={() => sidebarOpen && setSidebarOpen(false)}
      >
        {messages.length === 0 && (
          <div className="text-neutral-500 text-sm text-center mt-12">
            Ask me to check your calendar, draft an email, or schedule a meeting with a Meet link.
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            {editingIndex === i ? (
              <div className="max-w-[85%] w-full space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  autoFocus
                  className="w-full bg-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => submitEdit(i)}
                    className="bg-amber-400 text-neutral-950 text-xs font-medium px-3 py-1 rounded-full"
                  >
                    Resend
                  </button>
                  <button
                    onClick={() => setEditingIndex(null)}
                    className="bg-neutral-800 text-neutral-300 text-xs px-3 py-1 rounded-full"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-amber-400 text-neutral-950" : "bg-neutral-900 text-neutral-100"
                  }`}
                >
                  {m.text}
                </div>
                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-[10px] text-neutral-600">{formatTime(m.time)}</span>
                  <button
                    onClick={() => copyMessage(m.text, i)}
                    className="text-[10px] text-neutral-500 hover:text-amber-400"
                  >
                    {copiedIndex === i ? "Copied" : "Copy"}
                  </button>
                  {m.role === "user" && (
                    <button
                      onClick={() => startEdit(i, m.text)}
                      className="text-[10px] text-neutral-500 hover:text-amber-400"
                    >
                      Edit
                    </button>
                  )}
                  {m.role === "model" && (
                    <button
                      onClick={() => regenerate(i)}
                      disabled={loading}
                      className="text-[10px] text-neutral-500 hover:text-amber-400 disabled:opacity-50"
                    >
                      Refresh
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-neutral-900 rounded-2xl px-4 py-2.5 text-sm text-neutral-500">Thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="p-3 border-t border-neutral-800 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Ask CeeBee anything…"
          rows={1}
          className="flex-1 bg-neutral-900 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none overflow-y-auto leading-6"
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="bg-amber-400 text-neutral-950 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50 shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
