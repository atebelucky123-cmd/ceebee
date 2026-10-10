import { NextRequest, NextResponse } from "next/server";
import { getAccounts, pickAccount } from "@/lib/accounts";
import { sendEmail, sendReply, markAsRead } from "@/lib/gmail";

// The only path by which a CeeBee-drafted email actually leaves the
// building: Shina pressing Send on the draft card. CeeBee herself can only
// draft (see draft_email in lib/agent.ts) -- she never sends on her own.
export async function POST(req: NextRequest) {
  const { accountLabel, to, subject, body, threadId, inReplyTo, replyToMessageId } = await req.json();

  if (!to || !body) {
    return NextResponse.json({ error: "A draft needs a recipient and a body." }, { status: 400 });
  }

  const account = pickAccount(await getAccounts(), accountLabel);
  if (!account) return NextResponse.json({ error: "No Google account connected." }, { status: 400 });

  try {
    const result = threadId
      ? await sendReply(account.refresh_token, {
          threadId,
          inReplyToMessageId: inReplyTo ?? "",
          to,
          subject: subject ?? "",
          body,
        })
      : await sendEmail(account.refresh_token, to, subject ?? "", body);
    if (replyToMessageId) await markAsRead(account.refresh_token, replyToMessageId).catch(() => {});
    return NextResponse.json({ ...result, from: account.email });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send" },
      { status: 500 }
    );
  }
}
