"use client";

import { useState } from "react";
import type { Card, EmailDraft } from "@/lib/cards";
import { AlertIcon, CheckIcon } from "../Icons";

// Structured blocks under CeeBee's words. Everything here was built from a
// real tool result server-side -- the UI just renders it.

export function ChatCard({
  card,
  compact,
  onSendDraft,
  onAsk,
}: {
  card: Card;
  compact?: boolean;
  onSendDraft?: (draft: EmailDraft) => Promise<string | null>;
  onAsk?: (prompt: string) => void;
}) {
  switch (card.type) {
    case "agenda":
      return <AgendaCard card={card} compact={compact} />;
    case "email_draft":
      return <DraftCard card={card} onSend={onSendDraft} />;
    case "emails":
      return <EmailsCard card={card} onAsk={onAsk} />;
    case "actions":
      return <ActionsCard card={card} />;
    case "weather":
      return (
        <div className="rounded-2xl border border-line-strong bg-surface px-4 py-3 text-sm">
          <span className="font-mono text-honey">{card.temp ?? card.high}°</span> {card.label} · {card.condition}
        </div>
      );
  }
}

function AgendaCard({ card, compact }: { card: Extract<Card, { type: "agenda" }>; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-line-strong bg-surface overflow-hidden">
      <div className="px-4 pt-3 pb-1 text-[11px] font-bold tracking-[0.06em] text-muted">{card.title.toUpperCase()}</div>
      {card.items.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted">Nothing on.</div>
      ) : (
        card.items.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 ${compact ? "px-3.5 py-3" : "px-[18px] py-3.5"} ${
              i < card.items.length - 1 ? "border-b border-line" : ""
            }`}
          >
            <span
              className={`font-mono text-[13px] w-12 shrink-0 ${
                item.tone === "ember" ? "text-ember" : item.tone === "done" ? "text-muted" : "text-honey"
              }`}
            >
              {item.time ?? "—"}
            </span>
            <span className={`flex-1 min-w-0 text-[15px] ${item.tone === "done" ? "line-through text-muted" : ""}`}>
              {item.title}
            </span>
            {item.note && (
              <span className={`text-xs font-semibold shrink-0 ${item.tone === "ember" ? "text-ember" : "text-muted"}`}>
                {item.note}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function DraftCard({
  card,
  onSend,
}: {
  card: Extract<Card, { type: "email_draft" }>;
  onSend?: (draft: EmailDraft) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EmailDraft>(card);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = card.status === "sent";

  async function send() {
    if (!onSend || sending) return;
    setSending(true);
    setError(null);
    const err = await onSend(draft);
    setSending(false);
    if (err) setError(err);
    else setEditing(false);
  }

  const field = "w-full bg-raised border border-line-strong rounded-lg px-3 py-2 text-sm outline-none focus:border-honey";

  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-[18px] flex flex-col gap-2.5">
      <div className="text-[13px] text-muted flex items-center gap-2">
        {sent && (
          <span className="inline-flex items-center gap-1 text-honey font-semibold">
            <CheckIcon size={14} /> Sent ·
          </span>
        )}
        <span className="truncate">
          To: {card.to} · From: {card.accountLabel}
        </span>
      </div>
      {editing ? (
        <>
          <label className="sr-only" htmlFor="draft-to">To</label>
          <input id="draft-to" className={field} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          <label className="sr-only" htmlFor="draft-subject">Subject</label>
          <input id="draft-subject" className={field} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          <label className="sr-only" htmlFor="draft-body">Body</label>
          <textarea id="draft-body" rows={6} className={`${field} resize-y leading-relaxed`} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        </>
      ) : (
        <>
          <div className="font-bold text-[15px]">{draft.subject || "(No subject)"}</div>
          <div className="text-[15px] leading-relaxed text-soft whitespace-pre-wrap">{draft.body}</div>
        </>
      )}
      {error && (
        <div className="text-sm text-ember flex items-center gap-2">
          <AlertIcon size={16} /> {error}
        </div>
      )}
      {!sent && onSend && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={send}
            disabled={sending}
            className="h-10 px-[18px] rounded-[10px] bg-honey text-ground font-semibold text-sm disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send"}
          </button>
          <button
            onClick={() => setEditing((e) => !e)}
            className="h-10 px-4 rounded-[10px] border border-outline text-cream font-semibold text-sm"
          >
            {editing ? "Done editing" : "Edit"}
          </button>
        </div>
      )}
    </div>
  );
}

function EmailsCard({ card, onAsk }: { card: Extract<Card, { type: "emails" }>; onAsk?: (prompt: string) => void }) {
  return (
    <div className="rounded-2xl border border-line-strong bg-surface overflow-hidden">
      {card.items.map((e, i) => (
        <button
          key={e.id}
          onClick={() => onAsk?.(`Summarise the email from ${e.from} about "${e.subject}" (id ${e.id}, ${e.accountLabel} account)`)}
          className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-raised ${i < card.items.length - 1 ? "border-b border-line" : ""}`}
        >
          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${e.unread ? "bg-honey" : "bg-transparent"}`} />
          <span className="min-w-0 flex-1">
            <span className="flex justify-between gap-2">
              <span className={`text-sm truncate ${e.unread ? "font-bold" : "font-medium"}`}>{e.from}</span>
              <span className="text-[11px] text-muted shrink-0">{e.accountLabel}</span>
            </span>
            <span className="block text-sm truncate">{e.subject}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function ActionsCard({ card }: { card: Extract<Card, { type: "actions" }> }) {
  return (
    <div className="flex flex-col gap-1">
      {card.items.map((item, i) => (
        <div key={i} className={`flex items-start gap-2 text-[13px] ${item.ok ? "text-muted" : "text-ember"}`}>
          {item.ok ? <CheckIcon size={15} className="text-honey mt-px shrink-0" /> : <AlertIcon size={15} className="mt-px shrink-0" />}
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
