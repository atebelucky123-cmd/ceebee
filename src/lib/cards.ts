// Rich chat cards -- the structured things CeeBee shows alongside her words
// (an agenda, a ready-to-send email draft, a list of emails, what she just
// did). Built server-side only from *real tool results*, never from model
// text, so a card can't claim something that didn't happen.
//
// No server imports in this file: it's shared by lib/agent.ts and the chat
// UI components.

export type AgendaCardItem = {
  time: string | null;
  title: string;
  note: string | null;
  tone: "honey" | "ember" | "muted" | "done";
};

export type EmailDraft = {
  accountLabel: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  replyToMessageId?: string | null;
};

export type Card =
  | { type: "agenda"; title: string; items: AgendaCardItem[] }
  | ({ type: "email_draft"; status?: "draft" | "sent" } & EmailDraft)
  | {
      type: "emails";
      items: { id: string; accountLabel: string; from: string; subject: string; snippet: string; unread: boolean }[];
    }
  | { type: "weather"; label: string; temp: number | null; high: number; low: number; condition: string; rain: number | null }
  | { type: "actions"; items: { ok: boolean; text: string }[] };

export type AgentReply = { text: string; cards: Card[]; suggestions: string[] };

// Chat messages are stored as plain text in chat_messages.content (no schema
// change needed). Cards/suggestions ride along in a trailing HTML comment,
// URI-encoded so an email body containing "-->" can't break out of it.
const MARKER = "\n<!--ceebee:";

export function encodeStoredMessage(reply: AgentReply): string {
  if (reply.cards.length === 0 && reply.suggestions.length === 0) return reply.text;
  const payload = encodeURIComponent(JSON.stringify({ cards: reply.cards, suggestions: reply.suggestions }));
  return `${reply.text}${MARKER}${payload}-->`;
}

export function decodeStoredMessage(content: string): AgentReply {
  const idx = content.lastIndexOf(MARKER);
  if (idx === -1) return { text: content, cards: [], suggestions: [] };
  const text = content.slice(0, idx);
  const raw = content.slice(idx + MARKER.length).replace(/-->\s*$/, "");
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return { text, cards: parsed.cards ?? [], suggestions: parsed.suggestions ?? [] };
  } catch {
    return { text, cards: [], suggestions: [] };
  }
}

// A plain-text digest of cards, appended to history sent back to the model,
// so follow-ups like "make it shorter" or "send it to Tolu instead" know
// what the draft actually said.
export function cardsDigest(cards: Card[]): string {
  return cards
    .map((c) => {
      switch (c.type) {
        case "email_draft":
          return `[${c.status === "sent" ? "Sent" : "Draft (NOT sent)"} email from ${c.accountLabel} to ${c.to} | Subject: ${c.subject} | ${c.body}]`;
        case "agenda":
          return `[${c.title}: ${c.items.map((i) => `${i.time ?? "anytime"} ${i.title}${i.note ? ` (${i.note})` : ""}`).join("; ")}]`;
        case "emails":
          return `[Emails: ${c.items.map((e) => `id=${e.id} account=${e.accountLabel} ${e.from}: ${e.subject}`).join("; ")}]`;
        case "actions":
          return `[Actions: ${c.items.map((i) => `${i.ok ? "OK" : "FAILED"} ${i.text}`).join("; ")}]`;
        case "weather":
          return `[Weather ${c.label}: ${c.condition}, ${c.high}°/${c.low}°]`;
      }
    })
    .join("\n");
}
