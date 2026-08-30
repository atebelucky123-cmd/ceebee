import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getFullEmailBody } from "@/lib/gmail";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accountLabel = req.nextUrl.searchParams.get("accountLabel");
  if (!accountLabel) {
    return NextResponse.json({ error: "Missing accountLabel" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: account, error } = await supabase
    .from("google_accounts")
    .select("refresh_token")
    .eq("label", accountLabel)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }

  try {
    const result = await getFullEmailBody(account.refresh_token, id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load email" },
      { status: 500 }
    );
  }
}
