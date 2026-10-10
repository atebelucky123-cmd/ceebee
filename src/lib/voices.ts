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
