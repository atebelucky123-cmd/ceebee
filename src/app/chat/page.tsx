"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import ChatSidebar from "../components/ChatSidebar";

type Message = { role: "user" | "model"; text: string; time: string };

// Web Speech API isn't in TypeScript's standard DOM types, so we declare
// just the bits CeeBee's mic button needs. interimResults now streams
// partial transcripts as Shina talks (matching how Gemini's own voice
// input behaves), instead of only firing once at the end.
type SpeechRecognitionResultLike = { isFinal: boolean; [j: number]: { transcript: string } };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { [i: number]: SpeechRecognitionResultLike }; resultIndex: number } & { length?: number } & Iterable<never>) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const VOICE_MUTE_KEY = "ceebee-voice-muted";
// Which conversation was open last, so switching Dashboard -> Chat (which
// remounts this page fresh, since they're separate routes) restores it
// instead of always landing on a blank chat.
const ACTIVE_CONVERSATION_KEY = "ceebee-active-conversation";

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
  const [listening, setListening] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Refs update synchronously (unlike state), which matters here: without
  // this, calling ensureConversation() twice in one send cycle (once for
  // the user message, once inside requestReply) would each see a stale
  // null conversationId and create two separate conversations -- splitting
  // the user's message and CeeBee's reply into different chat histories.
  const conversationIdRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // What was in the input box before this recording started, so live
  // partial transcripts can be shown without permanently losing anything
  // Shina had already typed.
  const baseTextRef = useRef("");
  // CeeBee is a girl -- cache a female US English system voice once the
  // browser has finished loading its voice list (it loads asynchronously,
  // sometimes after a short delay, sometimes only once used).
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

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

  useEffect(() => {
    setVoiceMuted(localStorage.getItem(VOICE_MUTE_KEY) === "1");
  }, []);

  // Runs once on mount -- restores whatever conversation was open the last
  // time this page was visited. If that conversation no longer exists
  // (deleted, or the id is stale), silently fall back to a blank chat
  // instead of showing an error.
  useEffect(() => {
    const savedId = localStorage.getItem(ACTIVE_CONVERSATION_KEY);
    if (!savedId) return;
    loadConversation(savedId).catch(() => {
      localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    // Names commonly used by browsers/OSes for their US English female
    // voice -- checked in priority order. Falls back to any en-US voice,
    // then to the browser default, if none of these are installed.
    const FEMALE_US_VOICE_NAMES = [
      "Google US English", "Samantha", "Microsoft Zira", "Microsoft Aria",
      "Microsoft Jenny", "Aria", "Jenny", "Zira", "Female",
    ];

    function pickVoice() {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      const usVoices = voices.filter((v) => v.lang === "en-US" || v.lang?.startsWith("en-US"));
      const named = usVoices.find((v) =>
        FEMALE_US_VOICE_NAMES.some((name) => v.name.toLowerCase().includes(name.toLowerCase()))
      );

      preferredVoiceRef.current = named ?? usVoices[0] ?? voices.find((v) => v.lang?.startsWith("en")) ?? null;
    }

    pickVoice();
    // Chrome (and some others) only populate the voice list asynchronously
    // on first load, firing this event once they're ready.
    window.speechSynthesis.onvoiceschanged = pickVoice;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  function toggleVoiceMute() {
    setVoiceMuted((prev) => {
      const next = !prev;
      localStorage.setItem(VOICE_MUTE_KEY, next ? "1" : "0");
      if (next) window.speechSynthesis?.cancel();
      return next;
    });
  }

  function speak(text: string) {
    if (voiceMuted) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    // Cut off mid-sentence if a new reply arrives before the last one
    // finished, rather than queuing them up.
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    if (preferredVoiceRef.current) utterance.voice = preferredVoiceRef.current;
    window.speechSynthesis.speak(utterance);
  }

  async function ensureConversation(): Promise<string> {
    if (conversationIdRef.current) return conversationIdRef.current;
    const res = await fetch("/api/conversations", { method: "POST" });
    const data = await res.json();
    conversationIdRef.current = data.conversation.id;
    setConversationId(data.conversation.id);
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, data.conversation.id);
    return data.conversation.id;
  }

  async function loadConversation(id: string) {
    const res = await fetch(`/api/conversations/${id}/messages`);
    if (!res.ok) throw new Error("Conversation not found");
    const data = await res.json();
    conversationIdRef.current = id;
    setConversationId(id);
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
    setMessages(
      (data.messages ?? []).map((m: { role: string; content: string; created_at: string }) => ({
        role: m.role,
        text: m.content,
        time: m.created_at,
      }))
    );
  }

  function startNewChat() {
    conversationIdRef.current = null;
    setConversationId(null);
    setMessages([]);
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  }

  // Sends `historyBefore` + `text` to Gemini and appends the reply. Shared
  // by normal sending, "regenerate", and "edit + resend".
  async function requestReply(text: string, historyBefore: Message[]) {
    setLoading(true);
    const convId = await ensureConversation();

    let replyText: string;
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
      replyText = res.ok ? data.reply : `⚠️ ${data.error}`;
    } catch {
      replyText = "⚠️ Couldn't reach CeeBee. Check your connection.";
    }

    const replyMsg: Message = { role: "model", text: replyText, time: nowISO() };
    setMessages((prev) => [...prev, replyMsg]);
    speak(replyText);
    await fetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "model", content: replyText }),
    });
    setLoading(false);
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      alert("Voice input isn't supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    // Streams partial results as Shina talks, and keeps listening across
    // pauses instead of stopping after the first phrase -- she can watch
    // the transcript build up live and hit the mic again to stop whenever
    // she's done, the same way Gemini's voice input behaves.
    recognition.interimResults = true;
    recognition.continuous = true;

    baseTextRef.current = input;

    recognition.onresult = (event) => {
      const results = event.results as unknown as { [i: number]: SpeechRecognitionResultLike; length: number };
      let combined = "";
      for (let i = 0; i < results.length; i++) {
        combined += results[i][0].transcript;
      }
      const base = baseTextRef.current;
      setInput(base ? `${base} ${combined}` : combined);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    }

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
        <h1 className="font-semibold text-lg flex-1">CeeBee</h1>
        <button
          onClick={toggleVoiceMute}
          className="text-neutral-400"
          aria-label={voiceMuted ? "Unmute CeeBee's voice" : "Mute CeeBee's voice"}
          title={voiceMuted ? "CeeBee's voice is off" : "CeeBee's voice is on"}
        >
          {voiceMuted ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M11 5 6 9H3v6h3l5 4V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M17 9l6 6M23 9l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M11 5 6 9H3v6h3l5 4V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M15.5 8.5a5 5 0 010 7M18.5 6a9 9 0 010 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>
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
                    <>
                      <button
                        onClick={() => regenerate(i)}
                        disabled={loading}
                        className="text-[10px] text-neutral-500 hover:text-amber-400 disabled:opacity-50"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => speak(m.text)}
                        className="text-[10px] text-neutral-500 hover:text-amber-400"
                      >
                        Play
                      </button>
                    </>
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
        <button
          onClick={toggleListening}
          className={`shrink-0 rounded-full p-2.5 ${
            listening ? "bg-red-500 text-white animate-pulse" : "bg-neutral-900 text-neutral-400"
          }`}
          aria-label={listening ? "Stop recording" : "Voice input"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
            <path
              d="M5 11a7 7 0 0014 0M12 18v3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            const isDesktop =
              typeof window !== "undefined" &&
              window.matchMedia?.("(pointer: fine)").matches;
            if (e.key === "Enter" && !e.shiftKey && isDesktop) {
              e.preventDefault();
              sendMessage();
            }
            // On touch devices, Enter falls through to its normal
            // behavior -- inserting a newline -- since Send is a
            // dedicated button there, not a keyboard shortcut.
          }}
          placeholder={listening ? "Listening… tap the mic to stop" : "Ask CeeBee anything…"}
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
