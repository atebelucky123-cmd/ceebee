import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date"); // YYYY-MM-DD
  const sort = req.nextUrl.searchParams.get("sort") ?? "time"; // "time" | "priority"

  const supabase = getSupabaseServerClient();
  let query = supabase.from("schedule_events").select("*");

  if (date) query = query.eq("event_date", date);

  query =
    sort === "priority"
      ? query.order("priority", { ascending: true })
      : query.order("start_time", { ascending: true, nullsFirst: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title,
    description,
    event_date,
    start_time,
    meeting_link,
    priority,
    remind_before_minutes,
  } = body;

  if (!title || !event_date) {
    return NextResponse.json(
      { error: "Missing title or event_date" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("schedule_events")
    .insert({
      title,
      description: description ?? null,
      event_date,
      start_time: start_time ?? null,
      meeting_link: meeting_link ?? null,
      priority: priority ?? 3,
      remind_before_minutes: remind_before_minutes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
