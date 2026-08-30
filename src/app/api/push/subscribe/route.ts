import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const subscription = await req.json();
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("push_subscriptions").insert({ subscription });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
