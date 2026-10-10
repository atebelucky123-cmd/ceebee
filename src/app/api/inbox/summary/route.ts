import { NextRequest, NextResponse } from "next/server";
import { getAccounts } from "@/lib/accounts";
import { listInboxAcrossAccounts, senderName } from "@/lib/inbox";
import { completeText } from "@/lib/agent";

// "CeeBee's summary" at the top of the Inbox: one line of triage over the
// unread mail ("4 unread. Adeola needs your contract comments today; the
// rest can wait.") plus the single most useful next action. Cached per set
// of unread ids, so re-opening the inbox doesn't re-spend a model call.

const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 10 * 60_000;

export async function GET(req: NextRequest) {
  const label = req.nextUrl.searchParams.get("label");
  try {
    const all = await getAccounts();
    const accounts = label ? all.filter((a) => a.label === label) : all;
    const inbox = await listInboxAcrossAccounts(accounts, 10);
    const unread = inbox.filter((e) => e.unread).slice(0, 12);

    if (unread.length === 0) {
      return NextResponse.json({ unread: 0, summary: "Inbox zero. Nothing needs you right now.", focus: null });
    }

    const key = `${label ?? "all"}|${unread.map((e) => e.id).join(",")}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body);

    const list = unread
      .map((e, i) => `${i + 1}. id=${e.id} account=${e.accountLabel} from="${senderName(e.from)}" subject="${e.subject}" preview="${(e.snippet ?? "").slice(0, 160)}"`)
      .join("\n");

    const prompt = `You are CeeBee, Shina's assistant. Triage these ${unread.length} unread emails.
Reply with ONLY a JSON object, no code fences:
{"summary": "<one or two short sentences starting with '${unread.length} unread.' saying what actually needs Shina and what can wait>", "focus_id": "<id of the single email most worth acting on, or null if none>", "action": "<short button label for the best next step, e.g. 'Draft a reply to Adeola', or null>"}
Newsletters, receipts, notifications and promos can wait.

Emails:
${list}`;

    const raw = await completeText(prompt, 300);
    let parsed: { summary?: string; focus_id?: string | null; action?: string | null } | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim());
      } catch {
        console.error("Inbox summary: unparseable model output", raw);
      }
    }

    const focusEmail = unread.find((e) => e.id === parsed?.focus_id) ?? null;
    const body = {
      unread: unread.length,
      summary:
        parsed?.summary ||
        `${unread.length} unread. Latest is from ${senderName(unread[0].from)}: "${unread[0].subject}".`,
      focus: focusEmail
        ? {
            id: focusEmail.id,
            accountLabel: focusEmail.accountLabel,
            from: senderName(focusEmail.from),
            subject: focusEmail.subject,
            action: parsed?.action || `Draft a reply to ${senderName(focusEmail.from).split(" ")[0]}`,
          }
        : null,
    };
    if (parsed) cache.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (err) {
    console.error("Inbox summary error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
