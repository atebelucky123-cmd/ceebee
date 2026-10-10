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
