"use client";

import Link from "next/link";
import ChatThread, { SuggestionChips, TypingIndicator } from "../chat/ChatThread";
import Composer from "../chat/Composer";
import type { CeeBeeChat } from "../chat/useCeeBeeChat";
import { SpeakerIcon, SpeakerOffIcon } from "../Icons";
import type { Brief } from "./TodayCards";

// The always-there CeeBee column on desktop Today ("A · Hive -- Desktop ·
// Command Center"): she opens with her brief and one-tap offers, and the
// conversation carries on right there without leaving the dashboard.
export default function CeeBeePanel({ chat, brief }: { chat: CeeBeeChat; brief: Brief | null }) {
  const offers = brief
    ? [
        ...brief.insights.filter((i) => i.action).map((i) => ({ label: i.action!.label, prompt: i.action!.prompt })),
        ...brief.suggestions.map((s) => ({ label: s, prompt: s })),
      ]
        .filter((o, i, arr) => arr.findIndex((x) => x.label.toLowerCase() === o.label.toLowerCase()) === i)
        .slice(0, 3)
    : [];

  return (
    <aside
      aria-label="CeeBee assistant"
      className="hidden xl:flex w-[380px] shrink-0 flex-col gap-4 border-l border-line bg-aside p-6 min-h-0"
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full bg-honey ${chat.loading ? "animate-pulse" : ""}`} />
        <span className="font-bold flex-1">CeeBee</span>
        {chat.messages.length > 0 && (
          <Link href="/chat" className="text-xs font-semibold text-muted hover:text-honey mr-1">
            Open in Chat
          </Link>
        )}
        <button
          onClick={chat.toggleVoiceMute}
          aria-label={chat.voiceMuted ? "Turn on auto voice replies" : "Turn off auto voice replies"}
          title={chat.voiceMuted ? "Auto voice is off" : "CeeBee reads every reply aloud"}
          aria-pressed={!chat.voiceMuted}
          className={`w-10 h-10 rounded-[10px] border border-line-strong flex items-center justify-center ${
            chat.voiceMuted ? "text-muted" : "text-soft"
          }`}
        >
          {chat.voiceMuted ? <SpeakerOffIcon size={18} /> : <SpeakerIcon size={18} />}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="mt-auto flex flex-col gap-3.5">
          {brief ? (
            <div className="px-4 py-3.5 rounded-[16px_16px_16px_4px] bg-raised text-[15px] leading-normal">{brief.message}</div>
          ) : (
            <TypingIndicator compact />
          )}
          {chat.messages.length === 0 && (
            <SuggestionChips suggestions={offers.map((o) => o.label)} onPick={(label) => chat.send(offers.find((o) => o.label === label)?.prompt ?? label)} />
          )}
          <ChatThread chat={chat} compact />
        </div>
      </div>

      <Composer chat={chat} variant="panel" placeholder="Ask CeeBee anything…" />
    </aside>
  );
}
