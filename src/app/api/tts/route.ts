import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/tts";

// POST { text, voice? } -> audio bytes of CeeBee saying it.
export async function POST(req: NextRequest) {
  const { text, voice } = await req.json().catch(() => ({}));
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  try {
    const { audio, mime } = await synthesizeSpeech(text, typeof voice === "string" ? voice : undefined);
    return new NextResponse(new Uint8Array(audio), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    console.error("TTS failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "TTS failed" }, { status: 502 });
  }
}
