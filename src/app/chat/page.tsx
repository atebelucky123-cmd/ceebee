"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

type Message = { role: "user" | "model"; text: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: nextMessages.slice(0, -1).map((m) => ({
            role: m.role,
            parts: [{ text: m.text }],
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "model", text: `⚠️ ${data.error}` },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "model", text: data.reply }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "model", text: "⚠️ Couldn't reach CeeBee. Check your connection." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
        <Image
          src="/logo.svg"
          alt="CeeBee"
          width={32}
          height={32}
          className="rounded-full"
        />
        <h1 className="font-semibold text-lg">CeeBee</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-neutral-500 text-sm text-center mt-12">
            Ask me to check your calendar, draft an email, or schedule a
            meeting with a Meet link.
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-amber-400 text-neutral-950"
                  : "bg-neutral-900 text-neutral-100"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-neutral-900 rounded-2xl px-4 py-2.5 text-sm text-neutral-500">
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="p-3 border-t border-neutral-800 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask CeeBee anything…"
          className="flex-1 bg-neutral-900 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="bg-amber-400 text-neutral-950 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
