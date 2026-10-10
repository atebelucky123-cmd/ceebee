import { NextRequest, NextResponse } from "next/server";
import { getAccounts } from "@/lib/accounts";
import { listInboxAcrossAccounts } from "@/lib/inbox";

// Unified inbox across every connected account (or one, with ?label=).
// `reconnect` lists accounts whose Google connection has expired, so the
// Inbox can say so instead of looking empty.
export async function GET(req: NextRequest) {
  const label = req.nextUrl.searchParams.get("label"); // null = all accounts

  try {
    const all = await getAccounts();
    const accounts = label ? all.filter((a) => a.label === label) : all;
    const { emails, reconnect } = await listInboxAcrossAccounts(accounts, 10);
    return NextResponse.json({ emails, reconnect });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
