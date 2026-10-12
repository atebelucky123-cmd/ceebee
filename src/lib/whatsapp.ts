import { createHmac, timingSafeEqual } from "crypto";
import type { AgentReply, Card } from "@/lib/cards";

// WhatsApp Cloud API (Meta) -- sending messages and checking webhooks.
//
// Env:
//   WHATSAPP_ACCESS_TOKEN        permanent System User token (whatsapp_business_messaging)
//   WHATSAPP_PHONE_NUMBER_ID     the sending number's ID (WhatsApp > API Setup)
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN any secret string, also typed into Meta's webhook form
//   WHATSAPP_APP_SECRET          App settings > Basic > App secret (signs incoming webhooks)
//   WHATSAPP_ALLOWED_NUMBERS     who may talk to CeeBee, comma-separated, digits only
//                                with country code, e.g. 2348012345678
//   WHATSAPP_GRAPH_VERSION       optional, defaults to v23.0

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0"}`;

function config() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
  return { token, phoneNumberId };
}

async function post(body: Record<string, unknown>) {
  const { token, phoneNumberId } = config();
  const res = await fetch(`${GRAPH()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("WhatsApp send failed", res.status, err);
    throw new Error(`WhatsApp API error ${res.status}`);
  }
  return res.json();
}

// --- Security ---------------------------------------------------------------

// Meta signs every webhook body with the app secret; anything without a
// valid signature didn't come from Meta.
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = header.slice(7);
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Only Shina's own number(s) may use CeeBee -- she can read email and change
// the schedule, so strangers who find the bot's number get nothing.
export function isAllowedSender(waId: string): boolean {
  const allowed = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
  return allowed.includes(waId.replace(/\D/g, ""));
}

// --- Sending ------------------------------------------------------------------

// Shows the blue ticks and a "typing…" bubble while CeeBee thinks.
export async function markReadAndTyping(messageId: string) {
  await post({ status: "read", message_id: messageId, typing_indicator: { type: "text" } }).catch(() => {});
}

export function sendText(to: string, text: string) {
  return post({ to, type: "text", text: { body: text.slice(0, 4096), preview_url: false } });
}

// Up to 3 tappable reply buttons. Titles max 20 chars; the id (up to 256
// chars) is what comes back when tapped.
export function sendButtons(to: string, body: string, buttons: { id: string; title: string }[]) {
  return post({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

// --- Formatting CeeBee's replies for WhatsApp ---------------------------------

// WhatsApp uses *bold*, not **bold**.
function toWhatsAppMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "*$1*").replace(/^#+\s*/gm, "");
}

function cardToText(card: Card): string | null {
  switch (card.type) {
    case "agenda":
      return card.items.length
        ? `*${card.title}*\n${card.items
            .map((i) => `${i.time ?? "  —  "}  ${i.tone === "done" ? `~${i.title}~` : i.title}${i.note ? `  (${i.note})` : ""}`)
            .join("\n")}`
        : `*${card.title}*\nNothing on.`;
    case "emails":
      return card.items.map((e) => `${e.unread ? "• " : "  "}*${e.from}*: ${e.subject}`).join("\n");
    case "actions":
      return card.items.map((i) => `${i.ok ? "✓" : "✗"} ${i.text}`).join("\n");
    case "weather":
      return `${card.label}: ${card.condition}, ${card.high}°/${card.low}°`;
    case "email_draft":
      return null; // sent separately, with a Send button
  }
}

// One CeeBee reply -> WhatsApp messages: her words + cards as text, an email
// draft (if any) with Send / Don't send buttons, and her suggestions as
// tappable buttons.
export async function sendAgentReply(to: string, reply: AgentReply, draftRef: string | null) {
  const cardText = reply.cards.map(cardToText).filter(Boolean).join("\n\n");
  const body = [toWhatsAppMarkdown(reply.text), cardText].filter(Boolean).join("\n\n");

  const draftIndex = reply.cards.findIndex((c) => c.type === "email_draft");
  const draft = draftIndex >= 0 ? reply.cards[draftIndex] : null;
  const suggestions = reply.suggestions.slice(0, 3);

  if (draft && draft.type === "email_draft") {
    await sendText(to, body);
    const preview = `*To:* ${draft.to}\n*From:* ${draft.accountLabel}\n*Subject:* ${draft.subject}\n\n${draft.body}`;
    if (draftRef) {
      await sendButtons(to, preview, [
        { id: `draft:${draftRef}:${draftIndex}`, title: "Send" },
        { id: "nodraft", title: "Don't send" },
      ]);
    } else {
      await sendText(to, `${preview}\n\n(Open CeeBee to send this draft.)`);
    }
    return;
  }

  // Button titles max out at 20 characters; the full suggestion rides in
  // the id, so tapping still sends the whole thing.
  if (suggestions.length) {
    await sendButtons(
      to,
      body || "…",
      suggestions.map((s) => ({ id: `say:${s}`, title: s.length > 20 ? `${s.slice(0, 19)}…` : s }))
    );
  } else {
    await sendText(to, body || "Done.");
  }
}
