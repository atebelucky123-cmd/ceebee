import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { DEVICE_COOKIE, findTrustedDevice, touchDevice } from "@/lib/devices";

// CeeBee only works on trusted devices. Anything without a valid device
// cookie gets the PIN screen (pages) or a 401 (API).

// Routes that must work without a trusted device. Each of these does its own
// checking (CRON_SECRET, BRIDGE_SECRET, Google's OAuth code) or is public.
const OPEN_EXACT = new Set(["/unlock", "/api/unlock", "/api/bridge", "/api/auth/google/callback", "/privacy", "/terms"]);
const OPEN_PREFIX = ["/api/cron/"];

const TOUCH_EVERY_MS = 5 * 60_000;

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = request.nextUrl;
  if (OPEN_EXACT.has(pathname) || OPEN_PREFIX.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let device: Awaited<ReturnType<typeof findTrustedDevice>> = null;
  try {
    device = await findTrustedDevice(request.cookies.get(DEVICE_COOKIE)?.value);
  } catch {
    // Fail closed: if the device list can't be checked, nothing gets in.
  }

  if (device) {
    if (Date.now() - new Date(device.last_used_at).getTime() > TOUCH_EVERY_MS) {
      event.waitUntil(touchDevice(device.id).catch(() => {}));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except build output and the public files the browser, the
  // Home Screen app and push notifications need before unlocking. Files are
  // listed by name on purpose: a generic "has a dot" exclusion would let
  // /api/emails/x.y skip the lock.
  matcher: [
    "/((?!_next/static/|_next/image|favicon\\.ico$|manifest\\.json$|sw\\.js$|icon-\\d+\\.png$|logo\\.svg$|robots\\.txt$).*)",
  ],
};
