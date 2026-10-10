"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { speakNatural, stopSpeaking } from "./voice";
import { decodeStoredMessage, encodeStoredMessage, type Card, type EmailDraft } from "@/lib/cards";

// The one chat engine behind both the full Chat screen and the CeeBee panel
// on Today -- conversation persistence, voice in/out, edit/regenerate, and
// the v2 extras (cards, suggestion chips, sending drafts).

export type ChatMessage = {
  id?: string | null; // chat_messages row id, once persisted
  role: "user" | "model";
  text: string;
  time: string;
  cards: Card[];
  suggestions: string[];
};

// Web Speech API isn't in TypeScript's standard DOM types, so just the bits
// the mic needs. interimResults streams partial transcripts as Shina talks.
type SpeechRecognitionResultLike = { isFinal: boolean; [j: number]: { transcript: string } };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: unknown }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

// Auto-voice (CeeBee reading every reply aloud) is OFF unless Shina turns it
// on -- she speaks when asked: the Play buttons, or "Play my day" on Today.
// New key on purpose, so the old v1 "voice on" default doesn't carry over.
export const AUTO_VOICE_KEY = "ceebee-auto-voice";
const DEFAULT_CONVERSATION_KEY = "ceebee-active-conversation";


function nowISO() {
  return new Date().toISOString();
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private mode etc. -- fine to lose
  }
}

// Voice mute is one app-wide preference (shared by the Today panel and the
// Chat screen), read straight from localStorage via an external store so it
// is SSR-safe and stays in sync across every mounted chat.
const MUTE_EVENT = "ceebee:voice-mute-changed";
function subscribeMute(cb: () => void) {
  window.addEventListener(MUTE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(MUTE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
const readMute = () => readStorage(AUTO_VOICE_KEY) !== "1";

export function useCeeBeeChat({
  storageKey = DEFAULT_CONVERSATION_KEY,
  onReply,
}: {
  storageKey?: string;
  // Called after each CeeBee reply lands -- e.g. Today refreshes its plan
  // when she reports having changed something.
  onReply?: (reply: { text: string; cards: Card[]; suggestions: string[] }) => void;
} = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const voiceMuted = useSyncExternalStore(subscribeMute, readMute, () => true);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [restored, setRestored] = useState(false);

  // Refs update synchronously -- without this, ensureConversation() called
  // twice in one send cycle would each see a stale null and create two
  // conversations, splitting the message and the reply apart.
  const conversationIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const onReplyRef = useRef(onReply);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    onReplyRef.current = onReply;
  }, [onReply]);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setCoords(null),
      { timeout: 8000 }
    );
  }, []);


  const loadConversation = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (!res.ok) throw new Error("Conversation not found");
      const data = await res.json();
      conversationIdRef.current = id;
      setConversationId(id);
      writeStorage(storageKey, id);
      setMessages(
        (data.messages ?? []).map((m: { id: string; role: "user" | "model"; content: string; created_at: string }) => {
          const decoded = m.role === "model" ? decodeStoredMessage(m.content) : { text: m.content, cards: [], suggestions: [] };
          return { id: m.id, role: m.role, time: m.created_at, ...decoded };
        })
      );
    },
    [storageKey]
  );

  // Restore whichever conversation was open last; silently start fresh if
  // it's gone.
  useEffect(() => {
    const savedId = readStorage(storageKey);
    Promise.resolve()
      .then(() => (savedId ? loadConversation(savedId) : undefined))
      .catch(() => writeStorage(storageKey, null))
      .finally(() => setRestored(true));
  }, [storageKey, loadConversation]);

  function toggleVoiceMute() {
    const next = !readMute();
    writeStorage(AUTO_VOICE_KEY, next ? "0" : "1");
    if (next) stopSpeaking();
    window.dispatchEvent(new Event(MUTE_EVENT));
  }

  // Natural neural voice (see ./voice.ts); `force` plays even when muted,
  // for the per-message Play button.
  function speak(text: string, force = false) {
    if (readMute() && !force) return;
    speakNatural(text);
  }

  // Returns null if the conversation couldn't be created (e.g. the database
  // is unreachable) -- CeeBee still answers, the chat just isn't saved.
  async function ensureConversation(): Promise<string | null> {
    if (conversationIdRef.current) return conversationIdRef.current;
    try {
      const res = await fetch("/api/conversations", { method: "POST" });
      const data = await res.json();
      const id = data?.conversation?.id;
      if (!id) throw new Error(data?.error ?? "No conversation id");
      conversationIdRef.current = id;
      setConversationId(id);
      writeStorage(storageKey, id);
      return id;
    } catch (err) {
      console.error("Couldn't create a conversation; this chat won't be saved.", err);
      return null;
    }
  }

  function startNewChat() {
    conversationIdRef.current = null;
    messagesRef.current = []; // synchronously, so a send() right after starts clean
    setConversationId(null);
    setMessages([]);
    writeStorage(storageKey, null);
    stopSpeaking();
  }

  async function persist(convId: string | null, role: "user" | "model", content: string): Promise<string | null> {
    if (!convId) return null;
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content }),
      });
      const data = await res.json();
      return data.id ?? null;
    } catch {
      return null;
    }
  }

  // Sends `historyBefore` + `text` and appends CeeBee's reply. Shared by
  // sending, regenerate, and edit + resend.
  async function requestReply(text: string, historyBefore: ChatMessage[]) {
    setLoading(true);
    const convId = await ensureConversation();

    let reply: { text: string; cards: Card[]; suggestions: string[] };
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyBefore.map((m) => ({ role: m.role, parts: [{ text: m.text }], cards: m.cards })),
          lat: coords?.lat,
          lon: coords?.lon,
        }),
      });
      const data = await res.json();
      reply = res.ok
        ? { text: data.text, cards: data.cards ?? [], suggestions: data.suggestions ?? [] }
        : { text: `⚠️ ${data.error}`, cards: [], suggestions: [] };
    } catch {
      reply = { text: "⚠️ Couldn't reach CeeBee. Check your connection.", cards: [], suggestions: [] };
    }

    const replyMsg: ChatMessage = { role: "model", time: nowISO(), id: null, ...reply };
    setMessages((prev) => [...prev, replyMsg]);
    setLoading(false);
    speak(reply.text);
    onReplyRef.current?.(reply);
    const id = await persist(convId, "model", encodeStoredMessage(reply));
    replyMsg.id = id;
    setMessages((prev) => prev.map((m) => (m === replyMsg ? { ...m, id } : m)));
    return reply.text;
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function toggleListening() {
    if (listening) {
      stopListening();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      alert("Voice input isn't supported in this browser.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    baseTextRef.current = input;
    recognition.onresult = (event) => {
      const results = event.results as { [i: number]: SpeechRecognitionResultLike; length: number };
      let combined = "";
      for (let i = 0; i < results.length; i++) combined += results[i][0].transcript;
      const base = baseTextRef.current;
      setInput(base ? `${base} ${combined}` : combined);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    stopSpeaking();
    recognition.start();
    setListening(true);
  }

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    if (listening) stopListening();

    const before = messagesRef.current;
    const userMsg: ChatMessage = { role: "user", text, time: nowISO(), cards: [], suggestions: [] };
    setMessages([...before, userMsg]);
    if (override === undefined) setInput("");

    const convId = await ensureConversation();
    const isFirstMessage = before.length === 0;
    persist(convId, "user", text).then((id) =>
      setMessages((prev) => prev.map((m) => (m === userMsg ? { ...m, id } : m)))
    );
    if (isFirstMessage && convId) {
      // Placeholder title now; the AI-summarised title below replaces it.
      fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text.slice(0, 40) }),
      });
    }

    const replyText = await requestReply(text, before);

    if (isFirstMessage && replyText && convId) {
      fetch(`/api/conversations/${convId}/title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text, reply: replyText }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.title) console.error("Chat title generation didn't produce a title:", data);
          window.dispatchEvent(new Event("ceebee:conversations-changed"));
        })
        .catch((err) => console.error("Chat title request failed:", err));
    } else {
      window.dispatchEvent(new Event("ceebee:conversations-changed"));
    }
  }

  // Regenerate: re-ask with the same preceding history, replacing this reply.
  async function regenerate(index: number) {
    if (loading) return;
    const current = messagesRef.current;
    const lastUser = current[index - 1];
    if (!lastUser || lastUser.role !== "user") return;
    setMessages(current.slice(0, index));
    await requestReply(lastUser.text, current.slice(0, index - 1));
  }

  async function editAndResend(index: number, newText: string) {
    const text = newText.trim();
    if (!text || loading) return;
    const historyBefore = messagesRef.current.slice(0, index);
    setMessages([...historyBefore, { role: "user", text, time: nowISO(), cards: [], suggestions: [] }]);
    const convId = await ensureConversation();
    await persist(convId, "user", text);
    await requestReply(text, historyBefore);
  }

  // Sends a drafted email for real (the only way a CeeBee draft goes out),
  // then rewrites the stored message so the card stays "Sent" on reload.
  async function sendDraft(messageIndex: number, cardIndex: number, draft: EmailDraft): Promise<string | null> {
    const res = await fetch("/api/emails/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error ?? "Couldn't send that email.";

    const msg = messagesRef.current[messageIndex];
    if (!msg) return null;
    const cards = msg.cards.map((c, i) => (i === cardIndex ? ({ ...c, ...draft, type: "email_draft", status: "sent" } as Card) : c));
    const updated = { ...msg, cards };
    setMessages((prev) => prev.map((m, i) => (i === messageIndex ? updated : m)));
    if (conversationIdRef.current && msg.id) {
      fetch(`/api/conversations/${conversationIdRef.current}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id, content: encodeStoredMessage(updated) }),
      });
    }
    speak(`Sent to ${draft.to.split("@")[0]}.`);
    return null;
  }

  return {
    messages,
    input,
    setInput,
    loading,
    restored,
    conversationId,
    listening,
    voiceMuted,
    send,
    regenerate,
    editAndResend,
    sendDraft,
    speak,
    toggleVoiceMute,
    toggleListening,
    loadConversation,
    startNewChat,
  };
}

export type CeeBeeChat = ReturnType<typeof useCeeBeeChat>;
