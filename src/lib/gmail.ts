import { google } from "googleapis";
import { getAuthenticatedClient } from "@/lib/google";

// Lists the most recent messages in the inbox, decoded to plain summaries
// (sender, subject, snippet) rather than raw Gmail payload.
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
        metadataHeaders: ["Subject", "From", "Date"],
      });

      const headers = full.payload?.headers ?? [];
      const get = (name: string) =>
        headers.find((h) => h.name === name)?.value ?? "";

      return {
        id: msg.id,
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

// Sends a plain-text email from the connected account.
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
