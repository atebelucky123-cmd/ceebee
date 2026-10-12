import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getAccounts, pickAccount } from "@/lib/accounts";
import { runAgent, type HistoryMessage } from "@/lib/agent";
import { decodeStoredMessage, encodeStoredMessage, type Card } from "@/lib/cards";
import { sendEmail, sendReply, markAsRead } from "@/lib/gmail";
import {
  isAllowedSender,
  markReadAndTyping,
  sendAgentReply,
  sendText,
  verifySignature,
} from "@/lib/whatsapp";

// CeeBee on WhatsApp. Meta calls this URL:
//  - GET once, when the webhook is set up, to check the verify token.
//  - POST for every incoming message. We answer 200 straight away and do the
//    thinking in after(), so Meta never times out and re-sends the message.

export const maxDuration = 60;

const WHATSAPP_CONVERSATION_TITLE = "WhatsApp";

// Meta occasionally delivers the same message twice; remember recent ids.
const seen = new Set<string>();
function alreadySeen(id: string): boolean {
  if (seen.has(id)) return true;
  seen.add(id);
  if (seen.size > 500) seen.delete(seen.values().next().value!);
  return false;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && expected && p.get("hub.verify_token") === expected) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type IncomingMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  interactive?: { type: string; button_reply?: { id: string; title: string } };
  button?: { text: string; payload?: string };
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: { entry?: { changes?: { value?: { messages?: IncomingMessage[] } }[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const messages = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  for (const msg of messages) {
    if (alreadySeen(msg.id)) continue;
    if (!isAllowedSender(msg.from)) {
      console.warn("WhatsApp: ignored message from a number not in WHATSAPP_ALLOWED_NUMBERS");
      continue;
    }
    after(() => handleMessage(msg).catch((err) => console.error("WhatsApp handler failed", err)));
  }

  // Delivery/read status updates also arrive here -- nothing to do for them.
  return NextResponse.json({ ok: true });
}

async function handleMessage(msg: IncomingMessage) {
  const to = msg.from;
  await markReadAndTyping(msg.id);

  // Work out what Shina said (typed text, or a button she tapped).
  let text: string | null = null;
  if (msg.type === "text") text = msg.text?.body ?? null;
  else if (msg.type === "interactive" && msg.interactive?.button_reply) {
    const id = msg.interactive.button_reply.id;
    if (id === "nodraft") {
      await sendText(to, "Okay, I won't send it.");
      return;
    }
    if (id.startsWith("draft:")) {
      await sendStoredDraft(to, id);
      return;
    }
    text = id.startsWith("say:") ? id.slice(4) : msg.interactive.button_reply.title;
  } else if (msg.type === "button") text = msg.button?.text ?? null;

  if (!text?.trim()) {
    await sendText(to, "I can only read text messages here for now. Type it out and I'm on it.");
    return;
  }

  const supabase = getSupabaseServerClient();
  const conversationId = await getWhatsAppConversation();

  // Recent turns, so follow-ups like "yes, move it" make sense.
  const { data: recent } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(6);
  const history: HistoryMessage[] = (recent ?? []).reverse().map((m) => {
    const decoded = m.role === "model" ? decodeStoredMessage(m.content) : { text: m.content, cards: [] as Card[] };
    return { role: m.role as "user" | "model", parts: [{ text: decoded.text }], cards: decoded.cards };
  });

  await supabase.from("chat_messages").insert({ conversation_id: conversationId, role: "user", content: text });

  const accounts = await getAccounts().catch(() => []);
  let reply;
  try {
    reply = await runAgent(text, accounts, history, null, null);
  } catch (err) {
    console.error("WhatsApp: agent failed", err);
    await sendText(to, "Something went wrong on my side. Try that again in a moment.");
    return;
  }

  const { data: stored } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: conversationId, role: "model", content: encodeStoredMessage(reply) })
    .select("id")
    .single();
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  await sendAgentReply(to, reply, stored?.id ?? null);
}

// One ongoing "WhatsApp" conversation, so the chat also appears (and can be
// continued) in the app's Chats list.
async function getWhatsAppConversation(): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("title", WHATSAPP_CONVERSATION_TITLE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: WHATSAPP_CONVERSATION_TITLE })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't create WhatsApp conversation");
  return data.id;
}

// "Send" tapped on a draft: look the draft up in the stored reply (never
// trust the button text), send it, and mark it sent so it can't go twice.
async function sendStoredDraft(to: string, buttonId: string) {
  const [, rowId, cardIndexRaw] = buttonId.split(":");
  const supabase = getSupabaseServerClient();
  const { data: row } = await supabase.from("chat_messages").select("id, content").eq("id", rowId).maybeSingle();
  if (!row) {
    await sendText(to, "I couldn't find that draft any more.");
    return;
  }

  const reply = decodeStoredMessage(row.content);
  const cardIndex = Number(cardIndexRaw);
  const card = reply.cards[cardIndex];
  if (!card || card.type !== "email_draft") {
    await sendText(to, "I couldn't find that draft any more.");
    return;
  }
  if (card.status === "sent") {
    await sendText(to, "That one's already sent.");
    return;
  }

  const account = pickAccount(await getAccounts(), card.accountLabel);
  if (!account) {
    await sendText(to, "No Google account is connected, so I can't send it.");
    return;
  }

  try {
    if (card.threadId) {
      await sendReply(account.refresh_token, {
        threadId: card.threadId,
        inReplyToMessageId: card.inReplyTo ?? "",
        to: card.to,
        subject: card.subject,
        body: card.body,
      });
    } else {
      await sendEmail(account.refresh_token, card.to, card.subject, card.body);
    }
    if (card.replyToMessageId) await markAsRead(account.refresh_token, card.replyToMessageId).catch(() => {});
  } catch (err) {
    console.error("WhatsApp: draft send failed", err);
    await sendText(to, "I couldn't send that. If Google disconnected your account, tap Reconnect on CeeBee's Accounts page.");
    return;
  }

  reply.cards[cardIndex] = { ...card, status: "sent" };
  await supabase.from("chat_messages").update({ content: encodeStoredMessage(reply) }).eq("id", row.id);
  await sendText(to, `Sent to ${card.to} ✓`);
}
