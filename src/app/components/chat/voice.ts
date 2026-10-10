"use client";

// CeeBee's voice on the client: one shared player for the whole app, so a
// new reply (or muting, or starting the mic) always cuts off whatever she
// was saying instead of two clips talking over each other.
//
// Primary: natural neural voice from /api/tts (Gemini TTS).
// Fallback: the browser's built-in voice -- robotic, but better than
// silence when offline or the TTS quota is spent.

export const VOICE_KEY = "ceebee-voice";
export const VOICE_CHANGED_EVENT = "ceebee:voice-changed";
export const SPEAKING_EVENT = "ceebee:speaking";

const FEMALE_US_VOICE_NAMES = [
  "Google US English", "Samantha", "Microsoft Aria", "Microsoft Jenny",
  "Microsoft Zira", "Aria", "Jenny", "Zira", "Female",
];

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentRequest: AbortController | null = null;
let generation = 0;

export function getVoicePreference(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export function setVoicePreference(voice: string) {
  try {
    localStorage.setItem(VOICE_KEY, voice);
  } catch {
    // private mode -- fine to lose
  }
  window.dispatchEvent(new Event(VOICE_CHANGED_EVENT));
}

let speakingNow = false;

function setSpeaking(speaking: boolean) {
  speakingNow = speaking;
  window.dispatchEvent(new CustomEvent(SPEAKING_EVENT, { detail: speaking }));
}

// For useSyncExternalStore -- lets buttons show Play vs Stop.
export function isSpeaking() {
  return speakingNow;
}
export function subscribeSpeaking(cb: () => void) {
  window.addEventListener(SPEAKING_EVENT, cb);
  return () => window.removeEventListener(SPEAKING_EVENT, cb);
}

export function stopSpeaking() {
  generation++;
  currentRequest?.abort();
  currentRequest = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  setSpeaking(false);
}

function speakWithBrowser(text: string) {
  if (!window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  const us = voices.filter((v) => v.lang?.startsWith("en-US"));
  const voice =
    us.find((v) => FEMALE_US_VOICE_NAMES.some((n) => v.name.toLowerCase().includes(n.toLowerCase()))) ??
    us[0] ??
    voices.find((v) => v.lang?.startsWith("en")) ??
    null;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  if (voice) u.voice = voice;
  u.onend = () => setSpeaking(false);
  setSpeaking(true);
  window.speechSynthesis.speak(u);
}

// Speaks `text` in CeeBee's natural voice. Resolves once playback starts
// (or the fallback kicks in) -- not when it finishes.
export async function speakNatural(text: string, voice: string | null = getVoicePreference()) {
  const clean = text.replace(/[*_#`]/g, "").replace(/⚠️/g, "").trim();
  if (!clean) return;

  stopSpeaking();
  const myGeneration = generation;
  const controller = new AbortController();
  currentRequest = controller;
  setSpeaking(true);

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, voice }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const blob = await res.blob();
    // Something newer was said (or she was muted) while this was loading.
    if (myGeneration !== generation) return;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    currentUrl = url;
    audio.onended = () => {
      if (currentAudio === audio) stopSpeaking();
    };
    await audio.play();
  } catch (err) {
    if (myGeneration !== generation || (err instanceof DOMException && err.name === "AbortError")) return;
    console.warn("Natural voice unavailable, using browser voice:", err);
    speakWithBrowser(clean);
  }
}
