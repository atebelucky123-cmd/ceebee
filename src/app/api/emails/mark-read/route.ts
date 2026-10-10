import { NextRequest, NextResponse } from "next/server";
import { getAccounts } from "@/lib/accounts";
import { markEmailsRead, isMissingScopeError } from "@/lib/gmail";

// POST { label?: string } -- marks every unread inbox email as read, across
// all accounts or just one. Reports accounts that need a Reconnect to grant
// the "change emails" permission.
export async function POST(req: NextRequest) {
  const { label } = await req.json().catch(() => ({}));
  try {
    const all = await getAccounts();
    const accounts = label ? all.filter((a) => a.label === label) : all;
    let marked = 0;
    const needsReconnect: string[] = [];
    for (const acc of accounts) {
      try {
        marked += await markEmailsRead(acc.refresh_token, { all: true });
      } catch (err) {
        if (isMissingScopeError(err) || /invalid_grant/.test(String(err))) needsReconnect.push(acc.label);
        else console.error(`Mark read failed for ${acc.label}`, err);
      }
    }
    return NextResponse.json({ marked, needsReconnect });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
