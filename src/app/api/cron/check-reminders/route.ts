import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getWebPush } from "@/lib/webPush";

// Protect this route -- it's hit by an external cron service (e.g.
// cron-job.org), so it must not be callable by anyone who finds the URL.
function isAuthorized(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  return secret && secret === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const now = new Date();

  // Only fetch candidates that have a reminder set, aren't done, and
  // haven't already been notified -- keeps this query cheap even as the
  // table grows, since most rows won't match.
  const { data: events, error } = await supabase
    .from("schedule_events")
    .select("*")
    .not("remind_before_minutes", "is", null)
    .eq("notified", false)
    .eq("done", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = (events ?? []).filter((e) => {
    if (!e.start_time) return false;
    const eventDateTime = new Date(`${e.event_date}T${e.start_time}`);
    const reminderTime = new Date(
      eventDateTime.getTime() - e.remind_before_minutes * 60_000
    );
    // Fires once the reminder moment has arrived (and hasn't drifted more
    // than 2 minutes past it, in case the cron was briefly delayed).
    return now >= reminderTime && now.getTime() - reminderTime.getTime() < 120_000;
  });

  if (due.length === 0) {
    return NextResponse.json({ checked: events?.length ?? 0, sent: 0 });
  }

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("subscription");

  const webpush = getWebPush();
  let sent = 0;

  for (const event of due) {
    const payload = JSON.stringify({
      title: "CeeBee Reminder",
      body: `${event.title} starts at ${event.start_time.slice(0, 5)}`,
    });

    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch {
        // Subscription may have expired -- fine to skip silently here.
      }
    }

    await supabase
      .from("schedule_events")
      .update({ notified: true })
      .eq("id", event.id);
  }

  return NextResponse.json({ checked: events?.length ?? 0, due: due.length, sent });
}
