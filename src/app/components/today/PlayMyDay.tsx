"use client";

import { useSyncExternalStore } from "react";
import { isSpeaking, speakNatural, stopSpeaking, subscribeSpeaking } from "../chat/voice";
import { SpeakerIcon } from "../Icons";
import type { Brief } from "./TodayCards";

function spoken(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// What CeeBee says when Shina taps "Play my day": her brief, then the rest
// of today in order, then tasks. Built from the same /api/brief data the
// screen shows, so what she says always matches what's on screen.
export function dayScript(brief: Brief): string {
  const parts = [brief.message];
  const next = brief.nextUp;
  if (next && !brief.message.includes(next.item.title)) {
    parts.push(
      next.minutesUntil < 0
        ? `Right now you're in ${next.item.title}.`
        : `Next up is ${next.item.title}${next.item.start ? ` at ${spoken(next.item.start)}` : ""}.`
    );
  }
  const later = brief.today
    .filter((i) => !i.done && !i.cleared && i.id !== next?.item.id && (!i.start || i.start >= brief.now))
    .slice(0, 6)
    .map((i) => (i.start ? `${i.title} at ${spoken(i.start)}` : i.title));
  if (later.length) parts.push(`After that: ${listOf(later)}.`);
  else if (!next) parts.push("Nothing else is scheduled today.");
  if (brief.tasks.open) {
    parts.push(`You've got ${brief.tasks.open} open task${brief.tasks.open === 1 ? "" : "s"}.`);
  }
  return parts.join(" ");
}

export default function PlayMyDay({ brief, size = "md" }: { brief: Brief | null; size?: "md" | "sm" }) {
  const speaking = useSyncExternalStore(subscribeSpeaking, isSpeaking, () => false);

  return (
    <button
      onClick={() => (speaking ? stopSpeaking() : brief && speakNatural(dayScript(brief)))}
      disabled={!brief}
      aria-label={speaking ? "Stop CeeBee" : "Play my day"}
      className={`flex items-center gap-2 rounded-full font-semibold disabled:opacity-50 shrink-0 ${
        speaking ? "bg-raised border border-honey text-honey" : "bg-honey text-ground hover:bg-honey-hover"
      } ${size === "sm" ? "self-start h-9 px-3.5 text-[13px]" : "h-11 px-5 text-sm"}`}
    >
      {speaking ? (
        <span className="ceebee-typing flex gap-1" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : (
        <SpeakerIcon size={size === "sm" ? 16 : 18} />
      )}
      {speaking ? "Stop" : "Play my day"}
    </button>
  );
}
