import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getAccounts } from "@/lib/accounts";
import { getAuthenticatedClient } from "@/lib/google";

// Cheap unread badge for the nav -- one labels.get call per account, instead
// of /api/emails' list + per-message fetch (which the old dashboard used just
// to count unread rows).
export async function GET() {
  try {
    const accounts = await getAccounts();
    const counts = await Promise.all(
      accounts.map(async (acc) => {
        try {
          const gmail = google.gmail({ version: "v1", auth: getAuthenticatedClient(acc.refresh_token) });
          const { data } = await gmail.users.labels.get({ userId: "me", id: "INBOX" });
          return data.messagesUnread ?? 0;
        } catch {
          return 0;
        }
      })
    );
    return NextResponse.json({ unread: counts.reduce((a, b) => a + b, 0) });
  } catch {
    return NextResponse.json({ unread: 0 });
  }
}
