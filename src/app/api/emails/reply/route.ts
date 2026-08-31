import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { sendReply, markAsRead } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  const { accountLabel, messageId, threadId, inReplyToMessageId, to, subject, body } =
    await req.json();

  if (!accountLabel || !threadId || !to || !body) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
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
    const result = await sendReply(account.refresh_token, {
      threadId,
      inReplyToMessageId,
      to,
      subject: subject ?? "",
      body,
    });
    if (messageId) {
      await markAsRead(account.refresh_token, messageId).catch(() => {});
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send reply" },
      { status: 500 }
    );
  }
}
