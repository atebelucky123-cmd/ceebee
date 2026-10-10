import { NextRequest, NextResponse } from "next/server";
import { reorderScheduleEvents } from "@/lib/schedule";

// POST { date: "YYYY-MM-DD", ids: [...in the new order] }
export async function POST(req: NextRequest) {
  const { date, ids } = await req.json().catch(() => ({}));
  if (typeof date !== "string" || !Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: "Need a date and an ordered list of ids" }, { status: 400 });
  }
  try {
    return NextResponse.json(await reorderScheduleEvents(date, ids));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reorder failed" }, { status: 500 });
  }
}
