"use client";

// CeeBee's voice on the client: one shared player for the whole app, so a
// new reply (or muting, or starting the mic) always cuts off whatever she
// was saying instead of two clips talking over each other.
//
// Primary: natural neural voice from /api/tts (Gemini TTS).
// Fallback: the browser's built-in voice -- robotic, but better than
// silence when offline or the TTS quota is spent.

import { respellForSpeech } from "@/lib/voices";

export const VOICE_KEY = "ceebee-voice";
export const VOICE_CHANGED_EVENT = "ceebee:voice-changed";
export const SPEAKING_EVENT = "ceebee:speaking";

const FEMALE_US_VOICE_NAMES = [
  "Google US English", "Samantha", "Microsoft Aria", "Microsoft Jenny",
  "Microsoft Zira", "Aria", "Jenny", "Zira", "Female",
];

let currentUrl: string | null = null;
let currentRequest: AbortController | null = null;
let generation = 0;

// --- iPhone (iOS Safari) audio unlock ----------------------------------
// iOS only lets a page start sound *during* a tap. CeeBee's voice arrives
// ~4s after the tap, by which time Safari silently refuses to play it. The
// fix: one shared <audio> element, "unlocked" by playing a split second of
// silence synchronously inside the tap; iOS then allows that same element
// to play the real voice whenever it arrives. The first tap anywhere in the
// app unlocks it too, so auto-voice replies also work on iPhone.

let player: HTMLAudioElement | null = null;
let silentUrl: string | null = null;

function silentWavUrl(): string {
  const sampleRate = 8000;
  const samples = 1200; // 0.15s
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function getPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio();
    player.setAttribute("playsinline", "");
  }
  return player;
}

// Must be called synchronously from a tap/click handler. Runs on every tap
// (not just the first) so the player is always freshly unlocked and holds
// only silence until the real voice arrives.
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const p = getPlayer();
  silentUrl ??= silentWavUrl();
  p.src = silentUrl;
  p.load();
  p.play().catch(() => {});
  // The browser voice (fallback) has the same rule on iOS.
  try {
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
  } catch {
    // not supported
  }
}

if (typeof window !== "undefined") {
  const firstTap = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", firstTap);
    window.removeEventListener("touchend", firstTap);
  };
  window.addEventListener("pointerdown", firstTap);
  window.addEventListener("touchend", firstTap);
}

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
  // Fully empty the player, not just pause it: iPhone Safari can otherwise
  // replay the previous recording (e.g. a voice preview) when the player is
  // next given a new one.
  if (player) {
    player.pause();
    player.onended = null;
    player.removeAttribute("src");
    player.load();
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
  text = respellForSpeech(text);
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
  // Runs synchronously inside the tap that called us (before any await),
  // and after stopSpeaking so its pause() can't interrupt the unlock.
  unlockAudio();
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
    currentUrl = url;
    const audio = getPlayer();
    audio.onended = () => {
      if (myGeneration === generation) stopSpeaking();
    };
    audio.src = url;
    audio.load();
    await audio.play();
  } catch (err) {
    if (myGeneration !== generation || (err instanceof DOMException && err.name === "AbortError")) return;
    console.warn("Natural voice unavailable, using browser voice:", err);
    speakWithBrowser(clean);
  }
}
