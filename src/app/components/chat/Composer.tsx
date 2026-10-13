"use client";

import { useEffect, useRef } from "react";
import { MicIcon, SendIcon } from "../Icons";
import type { CeeBeeChat } from "./useCeeBeeChat";
import ModelPicker from "./ModelPicker";

// The "Message CeeBee…" box. `variant` follows the three Hive layouts:
// desktop chat, the Today side panel (smaller), and mobile chat (big honey
// send button outside the box).
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
      className={`${size} shrink-0 flex items-center justify-center disabled:opacity-50 ${cls}`}
    >
      <SendIcon size={18} />
    </button>
  );

  // Claude-style box: the message on top, controls underneath -- model
  // picker, then send, with the mic at the far right.
  if (variant === "mobile") {
    // Phone: send is the big honey button outside the box; the mic sits
    // inside it, where send used to be.
    return (
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0 flex flex-col pt-2.5 pb-1.5 pl-4 pr-1.5 rounded-[18px] bg-surface border border-chip focus-within:border-outline">
          <div className="flex pr-2.5">{textarea}</div>
          <div className="flex items-center justify-end gap-1 pt-1">
            <ModelPicker compact />
            {micButton("w-9 h-9", "bg-raised text-cream")}
          </div>
        </div>
        {sendButton("w-[52px] h-[52px] rounded-[18px]")}
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div className="flex flex-col pt-2.5 pb-1.5 pr-1.5 pl-4 rounded-2xl bg-raised border border-chip focus-within:border-outline">
        <div className="flex pr-2.5">{textarea}</div>
        <div className="flex items-center justify-end gap-1.5 pt-1">
          <ModelPicker compact />
          {sendButton("w-9 h-9 rounded-xl")}
          {micButton("w-9 h-9", "text-soft hover:text-cream")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pt-3 pb-2 pr-2 pl-5 rounded-[18px] bg-surface border border-chip focus-within:border-outline">
      <div className="flex pr-3">{textarea}</div>
      <div className="flex items-center justify-end gap-2 pt-1.5">
        <ModelPicker />
        {sendButton("w-10 h-10 rounded-xl")}
        {micButton("w-10 h-10", "bg-raised text-cream")}
      </div>
    </div>
  );
}
