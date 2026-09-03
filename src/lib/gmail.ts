import { google } from "googleapis";
import { getAuthenticatedClient } from "@/lib/google";

// Lists the most recent messages in the inbox, decoded to plain summaries
// (sender, subject, snippet) rather than raw Gmail payload. Includes
// threadId and the Message-ID header so replies can be threaded correctly.
export async function listRecentEmails(
  refreshToken: string,
  maxResults: number = 10
) {
  const auth = getAuthenticatedClient(refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  const { data } = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    labelIds: ["INBOX"],
  });

  const messages = await Promise.all(
    (data.messages ?? []).map(async (msg) => {
      const { data: full } = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date", "Message-ID"],
      });

      const headers = full.payload?.headers ?? [];
      const get = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value ?? "";

      return {
        id: msg.id,
        threadId: full.threadId,
        messageIdHeader: get("Message-ID"),
        from: get("From"),
        subject: get("Subject"),
        date: get("Date"),
        snippet: full.snippet,
        unread: full.labelIds?.includes("UNREAD") ?? false,
      };
    })
  );

  return messages;
}

// Strips an HTML email body down to readable plain text. Auto-generated
// emails (account notifications, marketing sends) often bury their real
// text/plain alternative under leftover Outlook conditional-comment
// boilerplate (<!--[if !mso]>, <!--[if false]>, etc.) that Gmail's own web
// client hides visually but which shows up as literal junk if you just
// print the raw MIME part -- so this renders the HTML version instead,
// which is what actually reflects what the email looks like.
function htmlToPlainText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "") // HTML/MSO conditional comments
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Fetches and decodes the full body of a single message. Prefers the
// text/html part (converted to clean plain text) over text/plain, since
// many auto-generated emails' plain-text alternative is itself poorly
// generated and includes raw markup; falls back to text/plain only when
// there's no HTML part at all.
export async function getFullEmailBody(refreshToken: string, messageId: string) {
  const auth = getAuthenticatedClient(refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  const { data } = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  type Part = {
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: unknown[];
  };

  function extractByType(part: Part, mimeType: string): string {
    if (part.mimeType === mimeType && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    if (part.parts) {
      for (const sub of part.parts as Part[]) {
        const text = extractByType(sub, mimeType);
        if (text) return text;
      }
    }
    return "";
  }

  const payload = data.payload as Part | undefined;
  const html = payload ? extractByType(payload, "text/html") : "";
  const plain = payload ? extractByType(payload, "text/plain") : "";

  const body = html ? htmlToPlainText(html) : plain;
  return { body: body || data.snippet || "(No content)" };
}

// Removes the UNREAD label -- called whenever the user opens/expands an
// email or replies to it, so read status stays accurate without a manual
// toggle.
export async function markAsRead(refreshToken: string, messageId: string) {
  const auth = getAuthenticatedClient(refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] },
  });
}

export async function sendEmail(
  refreshToken: string,
  to: string,
  subject: string,
  body: string
) {
  const auth = getAuthenticatedClient(refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\n");

  const encoded = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });

  return { messageId: data.id };
}

// Sends a reply within an existing thread. Requires the original message's
// threadId, its Message-ID header (for In-Reply-To/References so mail
// clients thread it visually), the sender to reply to, and the subject
// (auto-prefixed with "Re:" if not already).
export async function sendReply(
  refreshToken: string,
  {
    threadId,
    inReplyToMessageId,
    to,
    subject,
    body,
  }: {
    threadId: string;
    inReplyToMessageId: string;
    to: string;
    subject: string;
    body: string;
  }
) {
  const auth = getAuthenticatedClient(refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  const replySubject = subject.toLowerCase().startsWith("re:")
    ? subject
    : `Re: ${subject}`;

  const message = [
    `To: ${to}`,
    `Subject: ${replySubject}`,
    inReplyToMessageId ? `In-Reply-To: ${inReplyToMessageId}` : "",
    inReplyToMessageId ? `References: ${inReplyToMessageId}` : "",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ]
    .filter(Boolean)
    .join("\n");

  const encoded = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded, threadId },
  });

  return { messageId: data.id };
}
