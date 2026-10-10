import { createHash } from "crypto";

// CeeBee's real voice. The browser's built-in speechSynthesis voices are
// the robotic ones -- this uses Gemini's neural TTS (same GEMINI_API_KEY the
// app already has) so she sounds like a person. The client falls back to
// the browser voice only if this fails.

import { CEEBEE_VOICES, DEFAULT_VOICE, respellForSpeech } from "@/lib/voices";

// Fastest first. The lite model returns a ~10s clip in ~4s; the others are
// fallbacks if a model is unavailable or rate-limited on the account.
const MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"];

// Small in-memory cache so "Play" on a message (or the same brief twice)
// is instant and doesn't spend quota again.
const cache = new Map<string, { audio: Buffer; mime: string }>();
const CACHE_MAX = 60;

export const MAX_TTS_CHARS = 900;

// Strip markdown / emoji-ish noise that TTS would otherwise read out.
export function cleanForSpeech(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[*_#`>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/⚠️/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TTS_CHARS);
}

// Gemini 2.5 returns raw 16-bit PCM ("audio/L16;codec=pcm;rate=24000"),
// which browsers can't play directly -- wrap it in a WAV header.
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function synthesizeSpeech(rawText: string, voice: string = DEFAULT_VOICE) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const text = respellForSpeech(cleanForSpeech(rawText));
  if (!text) throw new Error("Nothing to say");
  const voiceName = CEEBEE_VOICES.some((v) => v.id === voice) ? voice : DEFAULT_VOICE;

  const key = createHash("sha1").update(`${voiceName}|${text}`).digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;

  // The style line steers delivery; Gemini TTS treats it as direction, not
  // script (verified by transcribing the output).
  const prompt = `Speak as CeeBee, a warm, quick-witted personal assistant -- natural and conversational, a little playful, never robotic:\n\n${text}`;

  let lastError = "TTS unavailable";
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
          }),
        }
      );
      if (!res.ok) {
        lastError = `${model}: ${res.status} ${(await res.text()).slice(0, 200)}`;
        continue;
      }
      const data = await res.json();
      const part = data.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData)?.inlineData as
        | { mimeType: string; data: string }
        | undefined;
      if (!part?.data) {
        lastError = `${model}: no audio in response`;
        continue;
      }

      let audio: Buffer = Buffer.from(part.data, "base64");
      let mime = part.mimeType;
      if (/L16|pcm/i.test(mime)) {
        const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
        audio = pcmToWav(audio, rate);
        mime = "audio/wav";
      }

      const result = { audio, mime };
      cache.set(key, result);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      return result;
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new Error(lastError);
}
