import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google";

// Visiting /api/auth/google kicks off the "Connect a Google account" flow.
// Optional ?label=work or ?label=personal lets you tag which account this is
// when you're connecting more than one.
export async function GET(req: NextRequest) {
  const label = req.nextUrl.searchParams.get("label") ?? "default";
  const url = getGoogleAuthUrl(label);
  return NextResponse.redirect(url);
}
