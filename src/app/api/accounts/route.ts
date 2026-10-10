import { NextResponse } from "next/server";
import { getAccounts, checkAccountConnection } from "@/lib/accounts";

// Connected Google accounts, each with whether its connection still works
// ("reconnect" = Google expired or revoked it; tap Reconnect to fix).
export async function GET() {
  try {
    const accounts = await getAccounts();
    const withStatus = await Promise.all(
      accounts.map(async (a) => ({ email: a.email, label: a.label, status: await checkAccountConnection(a) }))
    );
    return NextResponse.json({ accounts: withStatus });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
