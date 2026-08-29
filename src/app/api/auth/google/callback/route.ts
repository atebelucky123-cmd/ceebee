import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/google";
import { getSupabaseServerClient } from "@/lib/supabase";

// Google redirects here after the person approves access. We exchange the
// one-time code for tokens, then store the refresh token so CeeBee can act
// on this account later without asking you to sign in again.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const label = req.nextUrl.searchParams.get("state") ?? "default";

  if (!code) {
    return NextResponse.redirect(
      new URL("/?error=missing_code", req.nextUrl.origin)
    );
  }

  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    // This happens if the account already granted consent before and Google
    // skipped issuing a new refresh token. Revoke access in your Google
    // Account settings and try connecting again to force a fresh one.
    return NextResponse.redirect(
      new URL("/?error=no_refresh_token", req.nextUrl.origin)
    );
  }

  // Find out which email address this token belongs to.
  client.setCredentials(tokens);
  const oauth2 = (await import("googleapis")).google.oauth2({
    auth: client,
    version: "v2",
  });
  const { data: profile } = await oauth2.userinfo.get();

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("google_accounts").upsert(
    {
      email: profile.email,
      label,
      refresh_token: tokens.refresh_token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email" }
  );

  if (error) {
    console.error("Failed to store Google account:", error);
    return NextResponse.redirect(
      new URL("/?error=storage_failed", req.nextUrl.origin)
    );
  }

  return NextResponse.redirect(
    new URL(`/?connected=${profile.email}`, req.nextUrl.origin)
  );
}
