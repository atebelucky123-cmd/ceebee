"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Logo from "../Logo";
import { ChatCard } from "./Cards";
import type { CeeBeeChat, ChatMessage } from "./useCeeBeeChat";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// Tiny, safe formatter for model text: paragraphs, "- " bullets, **bold**.
// (Models slip into light markdown even when asked not to.)
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const bullet = /^\s*[-•*]\s+/.test(line);
        const content = line.replace(/^\s*[-•*]\s+/, "");
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <Fragment key={j}>{p}</Fragment>
        );
        if (!line.trim()) return <div key={i} className="h-2" />;
        return bullet ? (
          <div key={i} className="flex gap-2 pl-1">
            <span className="text-honey">•</span>
            <span>{parts}</span>
          </div>
        ) : (
          <div key={i}>{parts}</div>
        );
      })}
    </>
  );
}

export function SuggestionChips({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
  disabled?: boolean;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {suggestions.map((s, i) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          disabled={disabled}
          className={`min-h-9 px-3.5 py-1.5 rounded-full border text-[13px] font-semibold disabled:opacity-50 ${
            i === 0 ? "border-honey text-honey hover:bg-honey/10" : "border-outline text-soft hover:border-muted"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export function TypingIndicator({ compact }: { compact?: boolean }) {
  return (
    <div className="flex gap-3.5 items-center">
      {!compact && (
        <div className="w-8 h-8 shrink-0 rounded-[10px] bg-hive flex items-center justify-center">
          <Logo size={20} tile={false} />
        </div>
      )}
      <div className="ceebee-typing flex gap-1.5 px-1 py-2" aria-label="CeeBee is thinking">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default function ChatThread({
  chat,
  compact = false,
  empty,
}: {
  chat: CeeBeeChat;
  compact?: boolean;
  empty?: React.ReactNode;
}) {
  const { messages, loading } = chat;
  const bottomRef = useRef<HTMLDivElement>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const lastModelIndex = messages.map((m) => m.role).lastIndexOf("model");

  function copy(text: string, i: number) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex(null), 1500);
  }

  if (messages.length === 0 && !loading) return <>{empty}</>;

  return (
    <div className={`flex flex-col ${compact ? "gap-3.5" : "gap-[22px]"}`}>
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="group flex flex-col items-end">
            {editingIndex === i ? (
              <div className="w-full max-w-[480px] space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  autoFocus
                  aria-label="Edit message"
                  className="w-full bg-raised border border-line-strong rounded-xl px-3 py-2 text-[15px] outline-none focus:border-honey resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setEditingIndex(null);
                      chat.editAndResend(i, editText);
                    }}
                    className="bg-honey text-ground text-xs font-semibold px-3 py-1.5 rounded-full"
                  >
                    Resend
                  </button>
                  <button onClick={() => setEditingIndex(null)} className="border border-outline text-soft text-xs px-3 py-1.5 rounded-full">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`max-w-[85%] sm:max-w-[480px] bg-honey text-ground rounded-[18px_18px_4px_18px] whitespace-pre-wrap ${
                    compact ? "px-4 py-2.5 text-[15px] leading-[1.45]" : "px-[18px] py-3.5 text-base leading-normal"
                  }`}
                >
                  {m.text}
                </div>
                <MessageMeta>
                  <span>{formatTime(m.time)}</span>
                  <button onClick={() => copy(m.text, i)}>{copiedIndex === i ? "Copied" : "Copy"}</button>
                  <button
                    onClick={() => {
                      setEditingIndex(i);
                      setEditText(m.text);
                    }}
                  >
                    Edit
                  </button>
                </MessageMeta>
              </>
            )}
          </div>
        ) : (
          <ModelMessage
            key={i}
            m={m}
            index={i}
            compact={compact}
            showSuggestions={i === lastModelIndex && !loading}
            chat={chat}
            copied={copiedIndex === i}
            onCopy={() => copy(m.text, i)}
          />
        )
      )}
      {loading && <TypingIndicator compact={compact} />}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageMeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-1 px-1 text-[11px] text-muted [&>button:hover]:text-honey sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
      {children}
    </div>
  );
}

function ModelMessage({
  m,
  index,
  compact,
  showSuggestions,
  chat,
  copied,
  onCopy,
}: {
  m: ChatMessage;
  index: number;
  compact: boolean;
  showSuggestions: boolean;
  chat: CeeBeeChat;
  copied: boolean;
  onCopy: () => void;
}) {
  const isError = m.text.startsWith("⚠️");
  return (
    <div className={`group flex ${compact ? "" : "gap-3.5"}`}>
      {!compact && (
        <div className="w-8 h-8 shrink-0 rounded-[10px] bg-hive flex items-center justify-center" aria-hidden="true">
          <Logo size={20} tile={false} />
        </div>
      )}
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        {m.text && (
          <div
            className={
              compact
                ? `px-4 py-3.5 rounded-[16px_16px_16px_4px] bg-raised text-[15px] leading-normal ${isError ? "text-ember" : ""}`
                : `text-base leading-relaxed ${isError ? "text-ember" : ""}`
            }
          >
            <RichText text={m.text.replace(/^⚠️\s*/, "")} />
          </div>
        )}
        {m.cards.map((card, ci) => (
          <ChatCard
            key={ci}
            card={card}
            compact={compact}
            onSendDraft={(draft) => chat.sendDraft(index, ci, draft)}
            onAsk={(p) => chat.send(p)}
          />
        ))}
        {showSuggestions && <SuggestionChips suggestions={m.suggestions} onPick={(s) => chat.send(s)} disabled={chat.loading} />}
        <MessageMeta>
          <span>{formatTime(m.time)}</span>
          <button onClick={onCopy}>{copied ? "Copied" : "Copy"}</button>
          <button onClick={() => chat.regenerate(index)} disabled={chat.loading}>
            Retry
          </button>
          <button onClick={() => chat.speak(m.text, true)}>Play</button>
        </MessageMeta>
      </div>
    </div>
  );
}
