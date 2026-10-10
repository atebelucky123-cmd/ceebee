import { NextRequest, NextResponse } from "next/server";
import { getAccounts, pickAccount } from "@/lib/accounts";
import { buildDayContext } from "@/lib/context";
import { listInboxAcrossAccounts, senderName } from "@/lib/inbox";
import { completeText, splitSuggestions } from "@/lib/agent";
import { SUMMARY_MODEL } from "@/lib/settings";
import { spokenTime } from "@/lib/insights";
import { eyebrowDate, lagosParts } from "@/lib/time";

// The Today screen's brain: everything CeeBee would tell Shina if she
// walked in and said "morning". Facts (next up, clashes, rain, overdue,
// unread) are computed deterministically; only the short spoken brief on
// top is written by the model -- cached, with a template fallback, so a
// rate limit or model hiccup never blanks the Today screen.

const briefCache = new Map<string, { at: number; message: string; suggestions: string[] }>();
// The cache key only changes when the day itself changes (a new email, a
// ticked task, a moved event, a new part of the day), so the brief model
// is called a handful of times a day, not on every 5-minute refresh. The TTL
// is just a safety net.
const BRIEF_TTL_MS = 3 * 60 * 60_000;

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  const location = req.nextUrl.searchParams.has("lat") && !Number.isNaN(lat) && !Number.isNaN(lon) ? { lat, lon } : null;

  try {
    const accounts = await getAccounts().catch(() => []);
    const primary = pickAccount(accounts, null);

    const [ctx, inbox] = await Promise.all([
      buildDayContext(primary, location),
      listInboxAcrossAccounts(accounts, 6).catch(() => ({ emails: [], reconnect: [] as string[] })),
    ]);

    const now = lagosParts();
    const unread = inbox.emails.filter((e) => e.unread);
    // Expired Google connections get a visible nudge rather than an inbox
    // that just looks empty.
    if (inbox.reconnect.length) {
      ctx.insights.unshift({
        id: "reconnect-google",
        tone: "ember",
        text: `Your ${inbox.reconnect.join(" and ")} Google ${inbox.reconnect.length === 1 ? "account needs" : "accounts need"} reconnecting, so I can't see that email or calendar. Reconnect on the Accounts page.`,
      });
    }
    const openTasks = ctx.tasks.filter((t) => !t.done);
    const doneTasks = ctx.tasks.length - openTasks.length;
    const remaining = ctx.today.filter((i) => !i.done && !i.cleared && (!i.start || i.start >= now.hhmm));

    // Weather headline, e.g. "Rain likely 4 PM".
    let weatherNote: string | null = null;
    if (ctx.weather) {
      const rainy = ctx.weather.hourly.find((h) => h.time.startsWith(ctx.dateKey) && h.precipChance >= 50);
      weatherNote = rainy ? `Rain likely ${spokenTime(rainy.time.slice(11, 16))}` : ctx.weather.condition;
    }

    // --- The spoken brief ---------------------------------------------
    // No "in 25 min" here: relative times go stale while the brief is cached
    // (and would change the cache key every refresh). The Next Up banner
    // shows the live countdown instead.
    const partOfDay = now.hour < 12 ? "morning" : now.hour < 17 ? "afternoon" : "evening";
    const facts = [
      `Part of day: ${partOfDay}.`,
      ctx.nextUp
        ? `Next up: ${ctx.nextUp.item.title} at ${ctx.nextUp.item.start}${ctx.nextUp.minutesUntil < 0 ? " (happening now)" : ""}.`
        : "Nothing else timed today.",
      `${remaining.length} things left on today's plan: ${remaining.map((i) => `${i.start ?? "anytime"} ${i.title}`).join("; ") || "none"}.`,
      `${openTasks.length} open tasks, ${doneTasks} done.`,
      inbox.reconnect.length
        ? `Email unavailable: ${inbox.reconnect.join(", ")} needs reconnecting (don't claim the inbox is empty).`
        : unread.length
        ? `${unread.length} unread emails, e.g. ${unread.slice(0, 3).map((e) => `${senderName(e.from)}: "${e.subject}"`).join("; ")}.`
        : "Inbox: nothing unread.",
      ctx.weather ? `Weather: ${ctx.weather.currentTemp}°C, ${ctx.weather.condition.toLowerCase()}. ${weatherNote}.` : "",
      ...ctx.insights.map((i) => `Noticed: ${i.text}${i.action ? ` Offer: ${i.action.prompt}` : ""}`),
    ].filter(Boolean);

    const cacheKey = `${ctx.dateKey}|${facts.join("|")}`;
    let cached = briefCache.get(cacheKey);
    if (!cached || Date.now() - cached.at > BRIEF_TTL_MS) {
      const prompt = `You are CeeBee, Shina's personal assistant. Voice: quick, warm, a little cheeky.
Write her a brief for right now in 2-3 short sentences: start with a greeting that fits the time of day ("Morning!", "Afternoon!", "Evening!"), never say how many minutes away something is, cover only what matters most (emails worth knowing about, weather that affects plans, clashes), and END with one concrete offer phrased as a question if there's something useful you could do (e.g. "Want me to move the gym to tomorrow at 7?").
Then on a final line write: NEXT: <1-3 short tappable replies Shina might tap, separated by |, max 6 words each>

Facts:
${facts.join("\n")}`;
      const raw = await completeText(prompt, 220, { preferModel: SUMMARY_MODEL });
      const parsed = raw ? splitSuggestions(raw) : null;
      const fallbackSuggestions = ctx.insights.filter((i) => i.action).map((i) => i.action!.label);
      cached = {
        at: Date.now(),
        message: parsed?.text || fallbackBrief(now.hour, ctx.nextUp?.item.title ?? null, unread.length, ctx.insights[0]?.text ?? null),
        suggestions: parsed?.suggestions.length ? parsed.suggestions : fallbackSuggestions.slice(0, 2),
      };
      if (parsed?.text) briefCache.set(cacheKey, cached);
    }

    return NextResponse.json({
      greeting: `${greetingFor(now.hour)}, Shina`,
      dateLabel: eyebrowDate(ctx.dateKey),
      now: now.hhmm,
      weather: ctx.weather
        ? {
            temp: ctx.weather.currentTemp,
            condition: ctx.weather.condition,
            high: ctx.weather.high,
            low: ctx.weather.low,
            note: weatherNote,
          }
        : null,
      nextUp: ctx.nextUp,
      today: ctx.today,
      insights: ctx.insights,
      tasks: { open: openTasks.length, done: doneTasks, total: ctx.tasks.length },
      unread: unread.length,
      accounts: accounts.map((a) => ({ label: a.label, email: a.email })),
      message: cached.message,
      suggestions: cached.suggestions,
    });
  } catch (err) {
    console.error("Brief route error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

function fallbackBrief(hour: number, next: string | null, unread: number, insight: string | null): string {
  const hello = hour < 12 ? "Morning!" : hour < 17 ? "Afternoon!" : "Evening!";
  const parts = [hello];
  if (next) parts.push(`Next up is ${next}.`);
  if (unread) parts.push(`${unread} unread email${unread === 1 ? "" : "s"} waiting.`);
  if (insight) parts.push(insight);
  if (parts.length === 1) parts.push("Your day's clear. Want me to plan something?");
  return parts.join(" ");
}
