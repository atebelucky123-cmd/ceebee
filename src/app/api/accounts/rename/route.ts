import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function PATCH(req: NextRequest) {
  const { email, label } = await req.json();
  if (!email || !label) {
    return NextResponse.json(
      { error: "Missing email or label" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("google_accounts")
    .update({ label })
    .eq("email", email)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}
