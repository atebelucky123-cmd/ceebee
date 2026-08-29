import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { listRecentEmails } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const label = req.nextUrl.searchParams.get("label"); // null = all accounts

  const supabase = getSupabaseServerClient();
  let query = supabase.from("google_accounts").select("email, label, refresh_token");
  if (label) query = query.eq("label", label);

  const { data: accounts, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ emails: [] });
  }

  // Fetch from every connected account in parallel, tag each message with
  // which account it came from so the UI can show a unified inbox.
  const results = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const emails = await listRecentEmails(acc.refresh_token, 10);
        return emails.map((e) => ({ ...e, accountEmail: acc.email, accountLabel: acc.label }));
      } catch {
        return [];
      }
    })
  );

  const merged = results.flat().sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return NextResponse.json({ emails: merged });
}
