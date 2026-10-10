import { listRecentEmails } from "@/lib/gmail";
import type { GoogleAccount } from "@/lib/accounts";

export type InboxEmail = {
  id: string;
  threadId: string | null | undefined;
  messageIdHeader: string;
  from: string;
  subject: string;
  date: string;
  snippet: string | null | undefined;
  unread: boolean;
  accountEmail: string;
  accountLabel: string;
};

// Recent inbox mail across every connected account, newest first. Mirrors
// what GET /api/emails does, as a shared function the brief and the inbox
// triage can call directly.
export async function listInboxAcrossAccounts(accounts: GoogleAccount[], perAccount = 10): Promise<InboxEmail[]> {
  const results = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const emails = await listRecentEmails(acc.refresh_token, perAccount);
        return emails.map((e) => ({ ...e, id: e.id ?? "", accountEmail: acc.email, accountLabel: acc.label }));
      } catch {
        return [];
      }
    })
  );
  return results.flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function senderName(from: string): string {
  const name = from.replace(/<.*>/, "").replace(/"/g, "").trim();
  return name || from.replace(/[<>]/g, "");
}
