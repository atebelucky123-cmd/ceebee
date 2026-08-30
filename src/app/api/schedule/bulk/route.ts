import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

// action: "clear" marks every event on the given date as done (greyed out);
// "unclear" resets them all back to not-done.
export async function POST(req: NextRequest) {
  const { date, action } = await req.json();

  if (!date || (action !== "clear" && action !== "unclear")) {
    return NextResponse.json(
      { error: "Missing date, or action must be 'clear' or 'unclear'" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("schedule_events")
    .update({ done: action === "clear" })
    .eq("event_date", date)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}
