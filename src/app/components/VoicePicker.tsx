"use client";

import { useState, useSyncExternalStore } from "react";
import { CEEBEE_VOICES, DEFAULT_VOICE } from "@/lib/voices";
import { getVoicePreference, setVoicePreference, speakNatural, VOICE_CHANGED_EVENT } from "./chat/voice";
import { SpeakerIcon } from "./Icons";

const SAMPLE = "Hey Shina! Rain around four clashes with your gym. Want me to move it to tomorrow at seven?";

function subscribe(cb: () => void) {
  window.addEventListener(VOICE_CHANGED_EVENT, cb);
  return () => window.removeEventListener(VOICE_CHANGED_EVENT, cb);
}

// Pick how CeeBee sounds. Tapping a voice selects it and plays a sample.
export default function VoicePicker() {
  const selected = useSyncExternalStore(subscribe, () => getVoicePreference() ?? DEFAULT_VOICE, () => DEFAULT_VOICE);
  const [previewing, setPreviewing] = useState<string | null>(null);

  async function choose(id: string) {
    setVoicePreference(id);
    setPreviewing(id);
    await speakNatural(SAMPLE, id);
    setPreviewing(null);
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[17px] font-bold">CeeBee&apos;s voice</h2>
        <p className="text-sm text-muted">Tap a voice to hear it. She&apos;ll use it everywhere.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="CeeBee's voice">
        {CEEBEE_VOICES.map((v) => {
          const active = selected === v.id;
          return (
            <button
              key={v.id}
              role="radio"
              aria-checked={active}
              onClick={() => choose(v.id)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left border ${
                active ? "bg-honey text-ground border-honey" : "bg-surface border-line-strong hover:border-outline"
              }`}
            >
              <SpeakerIcon size={18} className={previewing === v.id ? "animate-pulse" : ""} />
              <span className="flex flex-col">
                <span className="font-semibold text-[15px]">{v.id}</span>
                <span className={`text-xs ${active ? "text-ground/70" : "text-muted"}`}>
                  {v.description}
                  {v.id === DEFAULT_VOICE ? " · default" : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
