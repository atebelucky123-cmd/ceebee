"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Email = {
  id: string;
  threadId: string;
  messageIdHeader: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  accountEmail: string;
  accountLabel: string;
};

type Account = { email: string; label: string };

type Summary = {
  unread: number;
  summary: string;
  focus: { id: string; accountLabel: string; from: string; subject: string; action: string } | null;
};

function extractEmailAddress(from: string) {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

function senderName(from: string) {
  return from.replace(/<.*>/, "").replace(/"/g, "").trim() || extractEmailAddress(from);
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// 10:42 today, "Sun" this week, "12 Sep" before that.
function shortWhen(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  if (now.getTime() - d.getTime() < 6 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString("en-GB", { weekday: "short" });
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function InboxPage() {
  const router = useRouter();
  const [emails, setEmails] = useState<Email[]>([]);
  // Which account filter the on-screen emails/summary belong to; loading is
  // derived from it rather than toggled inside the fetch effect.
  const [loadedFilter, setLoadedFilter] = useState<string | null | undefined>(undefined);
  const [summaryState, setSummaryState] = useState<{ filter: string | null; data: Summary } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const loading = loadedFilter !== filter;
  const summary = summaryState?.filter === filter ? summaryState.data : null;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fullBody, setFullBody] = useState<string | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [countsByLabel, setCountsByLabel] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts ?? []));
  }, []);

  useEffect(() => {
    const params = filter ? `?label=${encodeURIComponent(filter)}` : "";
    fetch(`/api/emails${params}`)
      .then((r) => r.json())
      .then((data) => {
        const list: Email[] = data.emails ?? [];
        setEmails(list);
        // Per-account unread counts come from the unfiltered list.
        if (!filter) {
          const counts: Record<string, number> = {};
          for (const e of list) if (e.unread) counts[e.accountLabel] = (counts[e.accountLabel] ?? 0) + 1;
          setCountsByLabel(counts);
        }
      })
      .catch(() => setEmails([]))
      .finally(() => setLoadedFilter(filter));
    fetch(`/api/inbox/summary${params}`)
      .then((r) => r.json())
      .then((d) => !d.error && setSummaryState({ filter, data: d }))
      .catch(() => {});
  }, [filter]);

  const totalUnread = useMemo(() => Object.values(countsByLabel).reduce((a, b) => a + b, 0), [countsByLabel]);

  function markReadLocally(email: Email) {
    if (!email.unread) return;
    setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, unread: false } : e)));
    setCountsByLabel((prev) => ({
      ...prev,
      [email.accountLabel]: Math.max((prev[email.accountLabel] ?? 1) - 1, 0),
    }));
  }

  async function toggleExpand(email: Email) {
    if (expandedId === email.id) {
      setExpandedId(null);
      setFullBody(null);
      return;
    }
    setExpandedId(email.id);
    setFullBody(null);
    setBodyLoading(true);
    // Opening counts as read immediately; the API call makes it official.
    markReadLocally(email);
    try {
      const res = await fetch(`/api/emails/${email.id}?accountLabel=${encodeURIComponent(email.accountLabel)}`);
      const data = await res.json();
      setFullBody(data.body ?? "(Couldn't load body)");
    } finally {
      setBodyLoading(false);
    }
  }

  async function sendReply(email: Email) {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/emails/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountLabel: email.accountLabel,
          messageId: email.id,
          threadId: email.threadId,
          inReplyToMessageId: email.messageIdHeader,
          to: extractEmailAddress(email.from),
          subject: email.subject,
          body: replyText,
        }),
      });
      if (res.ok) {
        setSentIds((prev) => new Set(prev).add(email.id));
        markReadLocally(email);
        setReplyingTo(null);
      }
    } finally {
      setSending(false);
    }
  }

  function askCeeBee(prompt: string) {
    router.push(`/chat?q=${encodeURIComponent(prompt)}`);
  }

  function draftPrompt(e: { id: string; from: string; subject: string; accountLabel: string }) {
    return `Draft a reply to ${senderName(e.from)}'s email "${e.subject}" (email id ${e.id}, ${e.accountLabel} account). Read it first.`;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main className="flex-1 min-h-0 overflow-y-auto px-5 lg:px-10 pt-[max(1.75rem,env(safe-area-inset-top))] lg:pt-9 pb-6 flex flex-col gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="m-0 font-display font-extrabold text-[32px] lg:text-[44px] tracking-tight">Inbox</h1>
          {accounts.length > 1 && (
            <label className="relative">
              <span className="sr-only">Account</span>
              <select
                value={filter ?? ""}
                onChange={(e) => setFilter(e.target.value || null)}
                className="appearance-none h-9 pl-3 pr-8 rounded-full border border-line-strong bg-surface text-[13px] font-semibold outline-none focus:border-honey"
              >
                <option value="">All accounts{totalUnread ? ` (${totalUnread})` : ""}</option>
                {accounts.map((a) => (
                  <option key={a.label} value={a.label}>
                    {a.label}
                    {countsByLabel[a.label] ? ` (${countsByLabel[a.label]})` : ""}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs">
                ▾
              </span>
            </label>
          )}
        </div>

        {/* CeeBee's triage */}
        <div className="p-4 rounded-[18px] bg-surface border border-line-strong flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full bg-honey ${summary ? "" : "animate-pulse"}`} />
            <span className="text-xs font-bold tracking-[0.06em] text-honey">CEEBEE&apos;S SUMMARY</span>
          </div>
          <div className="text-[15px] leading-normal">
            {summary ? summary.summary : <span className="text-muted">Reading your inbox…</span>}
          </div>
          {summary?.focus && (
            <button onClick={() => askCeeBee(draftPrompt(summary.focus!))} className="self-start text-sm font-bold text-honey hover:text-honey-hover">
              {summary.focus.action}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" />
            ))}
          </div>
        ) : emails.length === 0 ? (
          <div className="text-muted text-sm text-center py-8">No emails here. Connect a Google account on the Accounts page.</div>
        ) : (
          <div className="flex flex-col">
            {emails.map((e, idx) => {
              const name = senderName(e.from);
              const isFocus = summary?.focus?.id === e.id;
              const expanded = expandedId === e.id;
              return (
                <div key={`${e.accountEmail}-${e.id}`} className={idx < emails.length - 1 ? "border-b border-line" : ""}>
                  <button onClick={() => toggleExpand(e)} aria-expanded={expanded} className="w-full text-left flex gap-3 py-3.5">
                    <span
                      className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${
                        isFocus ? "bg-honey text-ground" : e.unread ? "bg-chip" : "bg-raised text-soft"
                      }`}
                      aria-hidden="true"
                    >
                      {initials(name)}
                    </span>
                    <span className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="flex justify-between gap-2">
                        <span className={`text-[15px] truncate ${e.unread ? "font-bold" : "font-medium text-soft"}`}>{name}</span>
                        <span className={`font-mono text-xs shrink-0 ${e.unread ? "text-honey" : "text-muted"}`}>{shortWhen(e.date)}</span>
                      </span>
                      <span className={`text-sm truncate ${e.unread ? "font-semibold" : ""}`}>{e.subject || "(No subject)"}</span>
                      <span className="text-[13px] text-muted truncate">
                        {accounts.length > 1 && <span className="capitalize">{e.accountLabel} · </span>}
                        {e.snippet}
                      </span>
                    </span>
                  </button>

                  {expanded && (
                    <div className="pb-4 pl-[52px] flex flex-col gap-3">
                      {bodyLoading ? (
                        <div className="h-20 rounded-xl bg-surface animate-pulse" />
                      ) : (
                        <p className="text-sm text-soft whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">{fullBody}</p>
                      )}
                      <div className="flex gap-2 flex-wrap items-center">
                        <button
                          onClick={() => askCeeBee(draftPrompt(e))}
                          className="h-9 px-3.5 rounded-[10px] bg-honey text-ground text-[13px] font-semibold"
                        >
                          Ask CeeBee to reply
                        </button>
                        <button
                          onClick={() => askCeeBee(`Summarise ${name}'s email "${e.subject}" (email id ${e.id}, ${e.accountLabel} account) and tell me if I need to do anything.`)}
                          className="h-9 px-3.5 rounded-[10px] border border-outline text-[13px] font-semibold"
                        >
                          Summarise
                        </button>
                        {!sentIds.has(e.id) && replyingTo !== e.id && (
                          <button
                            onClick={() => {
                              setReplyingTo(e.id);
                              setReplyText("");
                            }}
                            className="h-9 px-3.5 rounded-[10px] border border-outline text-[13px] font-semibold"
                          >
                            Reply myself
                          </button>
                        )}
                        <a
                          href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(e.accountEmail)}#all/${e.threadId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] font-semibold text-muted hover:text-honey ml-auto"
                        >
                          Open in Gmail
                        </a>
                      </div>
                      {sentIds.has(e.id) && <p className="text-[13px] text-honey font-semibold">Reply sent.</p>}
                      {replyingTo === e.id && (
                        <div className="flex flex-col gap-2">
                          <label htmlFor={`reply-${e.id}`} className="sr-only">
                            Your reply
                          </label>
                          <textarea
                            id={`reply-${e.id}`}
                            value={replyText}
                            onChange={(ev) => setReplyText(ev.target.value)}
                            placeholder="Write your reply…"
                            rows={4}
                            autoFocus
                            className="w-full bg-raised border border-line-strong rounded-xl px-3 py-2 text-sm outline-none focus:border-honey resize-y"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => sendReply(e)}
                              disabled={sending || !replyText.trim()}
                              className="h-9 px-4 rounded-[10px] bg-honey text-ground text-[13px] font-semibold disabled:opacity-50"
                            >
                              {sending ? "Sending…" : "Send"}
                            </button>
                            <button onClick={() => setReplyingTo(null)} className="h-9 px-4 rounded-[10px] border border-outline text-[13px] font-semibold">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
