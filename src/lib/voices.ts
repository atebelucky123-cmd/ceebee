// CeeBee's voice options (Gemini TTS prebuilt voices). No server imports --
// shared by lib/tts.ts and the voice picker UI.
export const CEEBEE_VOICES = [
  { id: "Aoede", description: "Breezy" },
  { id: "Laomedeia", description: "Upbeat" },
  { id: "Sulafat", description: "Warm" },
  { id: "Leda", description: "Youthful" },
  { id: "Kore", description: "Firm" },
  { id: "Zephyr", description: "Bright" },
] as const;

export const DEFAULT_VOICE = "Aoede"; // the one who says "Shina" right

// How CeeBee should *say* names that text-to-speech gets wrong. Applied only
// to spoken audio -- the screen still shows the real spelling. Google's
// voices don't accept phonetic (IPA) input, and telling the voice how to
// pronounce a name in its style prompt makes it read the instructions aloud,
// so names are respelled the way they sound instead.
// Shina = Yoruba Ṣínà, /ʃí.nā/: "sh" as in shoe, higher pitch on the first syllable.
export const PRONUNCIATIONS: Record<string, string> = {
  Shina: "Shee-nah",
};

export function respellForSpeech(text: string): string {
  return Object.entries(PRONUNCIATIONS).reduce(
    (out, [name, spoken]) => out.replace(new RegExp(`\b${name}\b`, "gi"), spoken),
    text
  );
}
