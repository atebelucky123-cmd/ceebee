import { listRecentEmails } from "@/lib/gmail";
import { isReconnectError, type GoogleAccount } from "@/lib/accounts";

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

// Recent inbox mail across every connected account, newest first, plus the
// labels of accounts whose Google connection has expired -- so callers can
// say "reconnect Personal" instead of showing a falsely empty inbox.
export async function listInboxAcrossAccounts(
  accounts: GoogleAccount[],
  perAccount = 10
): Promise<{ emails: InboxEmail[]; reconnect: string[] }> {
  const reconnect: string[] = [];
  const results = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const emails = await listRecentEmails(acc.refresh_token, perAccount);
        return emails.map((e) => ({ ...e, id: e.id ?? "", accountEmail: acc.email, accountLabel: acc.label }));
      } catch (err) {
        if (isReconnectError(err)) reconnect.push(acc.label);
        else console.error(`Inbox: couldn't load ${acc.label}`, err);
        return [];
      }
    })
  );
  const emails = results.flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return { emails, reconnect };
}

export function senderName(from: string): string {
  const name = from.replace(/<.*>/, "").replace(/"/g, "").trim();
  return name || from.replace(/[<>]/g, "");
}
