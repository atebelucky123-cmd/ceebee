import { NextRequest, NextResponse } from "next/server";
import { getCurrentModel, setCurrentModel, AVAILABLE_MODELS } from "@/lib/settings";

export async function GET() {
  const model = await getCurrentModel();
  return NextResponse.json({ model, available: AVAILABLE_MODELS });
}

export async function POST(req: NextRequest) {
  const { model } = await req.json();
  if (!AVAILABLE_MODELS.some((m) => m.id === model)) {
    return NextResponse.json({ error: "Unknown model" }, { status: 400 });
  }
  await setCurrentModel(model);
  return NextResponse.json({ success: true });
}
