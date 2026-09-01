"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

function extractEmailAddress(from: string) {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

export default function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

    // Unfiltered fetch, purely to compute unread counts per account tab --
    // independent of whichever filter is currently displayed.
    fetch("/api/emails")
      .then((r) => r.json())
      .then((data) => {
        const counts: Record<string, number> = {};
        for (const e of data.emails ?? []) {
          if (e.unread) counts[e.accountLabel] = (counts[e.accountLabel] ?? 0) + 1;
        }
        setCountsByLabel(counts);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = filter ? `?label=${filter}` : "";
    fetch(`/api/emails${params}`)
      .then((r) => r.json())
      .then((data) => setEmails(data.emails ?? []))
      .finally(() => setLoading(false));
  }, [filter]);

  async function toggleExpand(email: Email) {
    if (expandedId === email.id) {
      setExpandedId(null);
      setFullBody(null);
      return;
    }
    setExpandedId(email.id);
    setFullBody(null);
    setBodyLoading(true);

    // Optimistic: opening it counts as read immediately in the UI, the
    // server call below makes it official on Gmail's side.
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, unread: false } : e))
    );
    if (email.unread) {
      setCountsByLabel((prev) => ({
        ...prev,
        [email.accountLabel]: Math.max((prev[email.accountLabel] ?? 1) - 1, 0),
      }));
    }

    try {
      const res = await fetch(
        `/api/emails/${email.id}?accountLabel=${email.accountLabel}`
      );
      const data = await res.json();
      setFullBody(data.body ?? "(Couldn't load body)");
    } finally {
      setBodyLoading(false);
    }
  }

  function openReply(email: Email) {
    setReplyingTo(email.id);
    setReplyText("");
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
        setEmails((prev) =>
          prev.map((e) => (e.id === email.id ? { ...e, unread: false } : e))
        );
        if (email.unread) {
          setCountsByLabel((prev) => ({
            ...prev,
            [email.accountLabel]: Math.max((prev[email.accountLabel] ?? 1) - 1, 0),
          }));
        }
        setReplyingTo(null);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="bg-amber-400 text-neutral-950 text-xs font-medium px-3 py-1.5 rounded-full"
        >
          Back
        </Link>
        <h1 className="font-semibold text-lg">Emails</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3">
        {accounts.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setFilter(null)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1.5 ${
                filter === null
                  ? "bg-amber-400 text-neutral-950"
                  : "bg-neutral-900 text-neutral-400"
              }`}
            >
              All accounts
              {Object.values(countsByLabel).reduce((a, b) => a + b, 0) > 0 && (
                <span className="bg-neutral-950/20 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-semibold">
                  {Object.values(countsByLabel).reduce((a, b) => a + b, 0)}
                </span>
              )}
            </button>
            {accounts.map((a) => (
              <button
                key={a.label}
                onClick={() => setFilter(a.label)}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap capitalize flex items-center gap-1.5 ${
                  filter === a.label
                    ? "bg-amber-400 text-neutral-950"
                    : "bg-neutral-900 text-neutral-400"
                }`}
              >
                {a.label}
                {!!countsByLabel[a.label] && (
                  <span className="bg-amber-400/90 text-neutral-950 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-semibold">
                    {countsByLabel[a.label]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : emails.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            No emails found. Connect a Google account first.
          </div>
        ) : (
          <div className="space-y-2">
            {emails.map((e) => (
              <div
                key={`${e.accountEmail}-${e.id}`}
                className="bg-neutral-900 rounded-xl px-4 py-3"
              >
                <button
                  onClick={() => toggleExpand(e)}
                  className="w-full text-left"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-sm truncate text-neutral-300 flex items-center gap-2">
                      {e.unread && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      )}
                      {e.from}
                    </span>
                    <span className="text-[10px] text-neutral-600 shrink-0 capitalize">
                      {e.accountLabel}
                    </span>
                  </div>
                  <div className="text-sm mt-0.5">{e.subject}</div>
                  <p className="text-xs text-neutral-500 mt-1 line-clamp-1">
                    {e.snippet}
                  </p>
                </button>

                {expandedId === e.id && (
                  <div className="mt-3 pt-3 border-t border-neutral-800">
                    {bodyLoading ? (
                      <p className="text-xs text-neutral-500">Loading full email…</p>
                    ) : (
                      <>
                        <p className="text-sm text-neutral-300 whitespace-pre-wrap">
                          {fullBody}
                        </p>
                        <a
                          href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(
                            e.accountEmail
                          )}#all/${e.threadId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 text-xs underline mt-2 inline-block"
                        >
                          Go to Gmail
                        </a>
                      </>
                    )}
                  </div>
                )}

                {sentIds.has(e.id) ? (
                  <p className="text-xs text-amber-400 mt-2">Reply sent.</p>
                ) : replyingTo === e.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={replyText}
                      onChange={(ev) => setReplyText(ev.target.value)}
                      placeholder="Write your reply…"
                      rows={3}
                      autoFocus
                      className="w-full bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendReply(e)}
                        disabled={sending}
                        className="bg-amber-400 text-neutral-950 text-xs font-medium px-4 py-1.5 rounded-full disabled:opacity-50"
                      >
                        {sending ? "Sending…" : "Send"}
                      </button>
                      <button
                        onClick={() => setReplyingTo(null)}
                        className="bg-neutral-800 text-neutral-300 text-xs px-4 py-1.5 rounded-full"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => openReply(e)}
                    className="text-amber-400 text-xs font-medium mt-2"
                  >
                    Reply
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
