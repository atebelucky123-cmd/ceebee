"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ChatSidebar from "../components/ChatSidebar";
import ChatThread, { SuggestionChips } from "../components/chat/ChatThread";
import Composer from "../components/chat/Composer";
import { useCeeBeeChat } from "../components/chat/useCeeBeeChat";
import Logo from "../components/Logo";
import { BackIcon, ListIcon, SpeakerIcon, SpeakerOffIcon } from "../components/Icons";

const STARTERS = ["What does my afternoon look like?", "Anything urgent in my inbox?", "Plan my tomorrow"];

export default function ChatPage() {
  const chat = useCeeBeeChat();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadedTitle, setTitle] = useState("New chat");
  const [accountsLabel, setAccountsLabel] = useState<string | null>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        const labels = (d.accounts ?? []).map((a: { label: string }) => a.label);
        if (labels.length) setAccountsLabel(`Using ${labels.join(" + ")}`);
      })
      .catch(() => {});
  }, []);

  // Keep the header title in sync with the active conversation, including
  // when the AI-generated title lands a moment after the first reply.
  useEffect(() => {
    if (!chat.conversationId) return;
    const load = () =>
      fetch("/api/conversations")
        .then((r) => r.json())
        .then((d) => {
          const c = (d.conversations ?? []).find((x: { id: string }) => x.id === chat.conversationId);
          if (c) setTitle(c.title);
        })
        .catch(() => {});
    load();
    window.addEventListener("ceebee:conversations-changed", load);
    return () => window.removeEventListener("ceebee:conversations-changed", load);
  }, [chat.conversationId]);

  // /chat?q=... (from a Today insight, Inbox action, etc.) starts a fresh
  // conversation and asks straight away. Read from window rather than
  // useSearchParams so the page doesn't need a Suspense boundary.
  useEffect(() => {
    if (!chat.restored || autoSent.current) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;
    autoSent.current = true;
    window.history.replaceState(null, "", "/chat");
    chat.startNewChat();
    // Let the reset flush before sending into the fresh conversation.
    setTimeout(() => chat.send(q), 0);
  }, [chat.restored]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = chat.conversationId ? loadedTitle : "New chat";

  const empty = (
    <div className="flex flex-col items-center text-center gap-4 pt-16 lg:pt-24 px-6">
      <Logo size={56} />
      <h2 className="font-display font-extrabold text-3xl tracking-tight">What can I handle?</h2>
      <p className="text-muted max-w-sm">
        I already know your schedule, tasks and weather. Ask me to plan, move things, or draft an email.
      </p>
      <SuggestionChips suggestions={STARTERS} onPick={(s) => chat.send(s)} />
    </div>
  );

  const voiceButton = (
    <button
      onClick={chat.toggleVoiceMute}
      aria-label={chat.voiceMuted ? "Turn on auto voice replies" : "Turn off auto voice replies"}
      aria-pressed={!chat.voiceMuted}
      title={chat.voiceMuted ? "Auto voice is off -- tap Play on any reply to hear it" : "CeeBee reads every reply aloud"}
      className={`w-10 h-10 rounded-[10px] border border-line-strong flex items-center justify-center ${
        chat.voiceMuted ? "text-muted" : "text-honey"
      }`}
    >
      {chat.voiceMuted ? <SpeakerOffIcon size={18} /> : <SpeakerIcon size={18} />}
    </button>
  );

  return (
    <div className="flex flex-1 min-h-0">
      <ChatSidebar
        docked
        open
        onClose={() => {}}
        activeId={chat.conversationId}
        onSelect={(id) => chat.loadConversation(id)}
        onNewChat={chat.startNewChat}
      />
      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeId={chat.conversationId}
        onSelect={(id) => chat.loadConversation(id)}
        onNewChat={chat.startNewChat}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Desktop header */}
        <header className="hidden lg:flex h-[72px] shrink-0 px-8 border-b border-line items-center gap-3">
          <h1 className="text-lg font-bold flex-1 truncate">{title}</h1>
          {accountsLabel && <span className="text-[13px] text-muted">{accountsLabel}</span>}
          {voiceButton}
        </header>

        {/* Mobile header */}
        <header className="lg:hidden shrink-0 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-line flex items-center gap-2">
          <Link href="/dashboard" aria-label="Back" className="w-11 h-11 flex items-center justify-center">
            <BackIcon size={22} />
          </Link>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-bold truncate">{title}</span>
            <span className="text-xs text-muted">CeeBee · auto voice {chat.voiceMuted ? "off" : "on"}</span>
          </div>
          {voiceButton}
          <button onClick={() => setSidebarOpen(true)} aria-label="Conversations" className="w-11 h-11 flex items-center justify-center">
            <ListIcon size={22} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="w-full max-w-[720px] mx-auto px-4 lg:px-0 py-5 lg:py-8">
            <ChatThread chat={chat} empty={empty} />
          </div>
        </div>

        <div className="shrink-0 px-3 lg:px-0 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-7">
          <div className="w-full max-w-[720px] mx-auto">
            <div className="hidden lg:block">
              <Composer chat={chat} variant="desktop" />
            </div>
            <div className="lg:hidden">
              <Composer chat={chat} variant="mobile" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
