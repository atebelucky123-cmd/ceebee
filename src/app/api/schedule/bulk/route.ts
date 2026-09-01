import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

// "clear" greys out/locks whatever is still undone for the day (sets
// cleared=true on rows where done=false) -- it does NOT touch anything
// already marked done. "unclear" reverses that, resetting cleared back to
// false, again without touching done rows.
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
    .update({ cleared: action === "clear" })
    .eq("event_date", date)
    .eq("done", false)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}
