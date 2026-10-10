import { getSupabaseServerClient } from "@/lib/supabase";

export type GoogleAccount = { email: string; label: string; refresh_token: string };

// Every connected Google account, oldest first. The first-connected account
// is treated as primary (calendar writes go there) unless one is still
// explicitly labelled "default".
export async function getAccounts(): Promise<GoogleAccount[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("google_accounts")
    .select("email, label, refresh_token")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GoogleAccount[];
}

// Resolves which account a request should act as. An explicit label wins;
// otherwise "default", otherwise the first-connected account. Previously the
// chat route only ever looked up label = "default", so renaming that account
// on the Accounts page (which the UI encourages) silently broke chat.
export function pickAccount(accounts: GoogleAccount[], label?: string | null): GoogleAccount | null {
  if (accounts.length === 0) return null;
  if (label) {
    const match = accounts.find((a) => a.label.toLowerCase() === label.toLowerCase());
    if (match) return match;
  }
  return accounts.find((a) => a.label === "default") ?? accounts[0];
}

// Google kills a refresh token (invalid_grant) when the OAuth app is still in
// "Testing" mode (after 7 days), when access is revoked, or after long
// disuse. That used to surface as a silently empty inbox; this lets the UI
// say "reconnect" instead.
export function isReconnectError(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } };
  return e?.response?.data?.error === "invalid_grant" || /invalid_grant/i.test(e?.message ?? "");
}

// "upgrade" = the connection works but predates a permission CeeBee now
// uses (e.g. gmail.modify for marking email read) -- a Reconnect grants it.
export async function checkAccountConnection(
  acc: GoogleAccount
): Promise<"ok" | "reconnect" | "upgrade" | "error"> {
  const { getAuthenticatedClient, GOOGLE_SCOPES } = await import("@/lib/google");
  try {
    const client = getAuthenticatedClient(acc.refresh_token);
    const { token } = await client.getAccessToken();
    if (!token) return "error";
    const info = await client.getTokenInfo(token);
    const missing = GOOGLE_SCOPES.filter((s) => !s.includes("userinfo") && !info.scopes.includes(s));
    return missing.length ? "upgrade" : "ok";
  } catch (err) {
    return isReconnectError(err) ? "reconnect" : "error";
  }
}
