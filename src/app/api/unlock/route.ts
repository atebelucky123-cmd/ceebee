import { NextRequest, NextResponse } from "next/server";
import {
  DEVICE_COOKIE, DEVICE_MAX_AGE, checkPasscode, createTrustedDevice, describeDevice,
  recordFailedUnlock, unlockStatus,
} from "@/lib/devices";

// POST { pin, standalone } -- checks the 6-digit PIN against CEEBEE_PASSCODE
// and, if right, trusts this browser for a year.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const body = await req.json().catch(() => ({}));
  const pin = typeof body.pin === "string" ? body.pin : "";
  const standalone = body.standalone === true;

  try {
    const status = await unlockStatus(ip);
    if (status.waitMinutes > 0) {
      return NextResponse.json({ error: "locked_out", waitMinutes: status.waitMinutes }, { status: 429 });
    }

    const result = /^\d{6}$/.test(pin) ? checkPasscode(pin) : "wrong";
    if (result === "unset") {
      return NextResponse.json({ error: "CEEBEE_PASSCODE isn't set on the server." }, { status: 500 });
    }
    if (result === "wrong") {
      await recordFailedUnlock(ip);
      const triesLeft = status.triesLeft - 1;
      return NextResponse.json({ error: "wrong_pin", triesLeft }, { status: triesLeft > 0 ? 401 : 429 });
    }

    const ua = req.headers.get("user-agent") ?? "";
    const cookie = await createTrustedDevice(describeDevice(ua, standalone), ua);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(DEVICE_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_MAX_AGE,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Couldn't reach CeeBee's database. Try again in a moment." }, { status: 503 });
  }
}
