import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { DEVICE_COOKIE, hashToken, readDeviceCookie } from "@/lib/devices";

// Lists trusted devices for Settings. `current` marks the one making the request.
export async function GET(req: NextRequest) {
  const token = readDeviceCookie(req.cookies.get(DEVICE_COOKIE)?.value);
  const currentHash = token ? hashToken(token) : null;

  const { data, error } = await getSupabaseServerClient()
    .from("trusted_devices")
    .select("id, label, token_hash, created_at, last_used_at")
    .order("last_used_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const devices = (data ?? []).map(({ token_hash, ...d }) => ({ ...d, current: token_hash === currentHash }));
  return NextResponse.json({ devices });
}
