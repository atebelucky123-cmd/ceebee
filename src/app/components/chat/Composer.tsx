"use client";

import { useEffect, useRef } from "react";
import { MicIcon, SendIcon } from "../Icons";
import type { CeeBeeChat } from "./useCeeBeeChat";

// The "Message CeeBee…" bar. `variant` follows the three Hive layouts:
// desktop chat (mic + send in the bar), the Today side panel (smaller), and
// mobile chat (big honey hold-to-talk button outside the bar).
export default function Composer({
  chat,
  variant = "desktop",
  placeholder = "Message CeeBee…",
  autoFocus,
}: {
  chat: CeeBeeChat;
  variant?: "desktop" | "panel" | "mobile";
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { input, setInput, send, loading, listening, toggleListening } = chat;
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 5 * 24)}px`;
  }, [input]);

  const textarea = (
    <>
      <label htmlFor={`composer-${variant}`} className="sr-only">
        Message CeeBee
      </label>
      <textarea
        id={`composer-${variant}`}
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends on devices with a real keyboard; on touch devices it
          // inserts a newline, since Send is a dedicated button there.
          const fine = window.matchMedia?.("(pointer: fine)").matches;
          if (e.key === "Enter" && !e.shiftKey && fine) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={listening ? "Listening… tap the mic to stop" : placeholder}
        className={`flex-1 min-w-0 bg-transparent outline-none resize-none leading-6 placeholder:text-muted ${
          variant === "panel" ? "text-[15px]" : "text-base"
        }`}
      />
    </>
  );

  const micButton = (size: string, cls: string) => (
    <button
      onClick={toggleListening}
      aria-label={listening ? "Stop recording" : "Voice input"}
      aria-pressed={listening}
      className={`${size} shrink-0 rounded-xl flex items-center justify-center ${
        listening ? "bg-ember text-ground animate-pulse" : cls
      }`}
    >
      <MicIcon size={20} />
    </button>
  );

  const sendButton = (size: string, cls = "bg-honey text-ground") => (
    <button
      onClick={() => send()}
      disabled={loading || !input.trim()}
      aria-label="Send"
      className={`${size} shrink-0 rounded-xl flex items-center justify-center disabled:opacity-50 ${cls}`}
    >
      <SendIcon size={18} />
    </button>
  );

  if (variant === "mobile") {
    return (
      <div className="flex items-end gap-2">
        <div className="flex-1 flex items-end min-h-[52px] py-1.5 pl-4 pr-1.5 rounded-[18px] bg-surface border border-chip focus-within:border-outline">
          <div className="flex-1 py-2 flex">{textarea}</div>
          {sendButton("w-10 h-10", "bg-raised text-cream")}
        </div>
        <button
          onClick={toggleListening}
          aria-label={listening ? "Stop recording" : "Hold to talk"}
          aria-pressed={listening}
          className={`w-[52px] h-[52px] shrink-0 rounded-[18px] flex items-center justify-center ${
            listening ? "bg-ember text-ground animate-pulse" : "bg-honey text-ground"
          }`}
        >
          <MicIcon size={22} />
        </button>
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div className="flex items-end gap-2 py-1.5 pr-1.5 pl-4 rounded-2xl bg-raised border border-chip focus-within:border-outline">
        <div className="flex-1 py-2 flex">{textarea}</div>
        {micButton("w-10 h-10", "text-soft hover:text-cream")}
        {sendButton("w-10 h-10")}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 py-2 pr-2 pl-5 rounded-[18px] bg-surface border border-chip focus-within:border-outline">
      <div className="flex-1 py-2.5 flex">{textarea}</div>
      {micButton("w-11 h-11", "bg-raised text-cream")}
      {sendButton("w-11 h-11")}
    </div>
  );
}
