import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase";

// Trusted-device lock. Unlocking with the PIN gives this browser a long-lived
// cookie of the form "<token>.<signature>". The signature (HMAC with a key
// derived from a server-only secret) lets the proxy reject forged or garbled
// cookies without touching the database; the token's SHA-256 hash must also
// be a row in trusted_devices, so deleting that row revokes the device at
// once. The raw token is never stored.

export const DEVICE_COOKIE = "cb_device";
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 365; // ~1 year

// Wrong-PIN limits: per IP, plus an overall ceiling so rotating IPs can't
// brute-force a 6-digit PIN. Devices that are already trusted are unaffected.
const IP_LIMIT = { max: 5, windowMs: 15 * 60_000 };
const GLOBAL_LIMIT = { max: 20, windowMs: 60 * 60_000 };

function signingKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createHash("sha256").update(`ceebee-device-cookie-v1:${secret}`).digest();
}

function sign(token: string) {
  return createHmac("sha256", signingKey()).update(token).digest("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Returns the raw token if the cookie value carries a valid signature.
export function readDeviceCookie(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  return safeEqual(sig, sign(token)) ? token : null;
}

export function checkPasscode(pin: string): "ok" | "wrong" | "unset" {
  const expected = process.env.CEEBEE_PASSCODE;
  if (!expected) return "unset";
  return safeEqual(pin, expected) ? "ok" : "wrong";
}

// Looks the device up by cookie. Returns its row id, or null if the cookie
// is missing, forged, or the device has been removed.
export async function findTrustedDevice(cookieValue: string | undefined) {
  const token = readDeviceCookie(cookieValue);
  if (!token) return null;
  const { data } = await getSupabaseServerClient()
    .from("trusted_devices")
    .select("id, last_used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  return data as { id: string; last_used_at: string } | null;
}

export async function touchDevice(id: string) {
  await getSupabaseServerClient()
    .from("trusted_devices")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id);
}

export async function createTrustedDevice(label: string, userAgent: string) {
  const token = randomBytes(32).toString("base64url");
  const { error } = await getSupabaseServerClient()
    .from("trusted_devices")
    .insert({ token_hash: hashToken(token), label, user_agent: userAgent.slice(0, 500) });
  if (error) throw new Error(error.message);
  return `${token}.${sign(token)}`;
}

// "iPhone · Safari", "Windows · Edge", "iPhone · Home Screen app"...
export function describeDevice(userAgent: string, standalone: boolean) {
  const ua = userAgent;
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && standalone)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "Device";
  if (standalone) return `${device} · Home Screen app`;
  const browser = /Edg(A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /(Firefox|FxiOS)\//.test(ua)
        ? "Firefox"
        : /(Chrome|CriOS)\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  return `${device} · ${browser}`;
}

// How long this IP must wait before another try (0 = may try now), and how
// many wrong PINs it has left in the current window.
export async function unlockStatus(ip: string): Promise<{ waitMinutes: number; triesLeft: number }> {
  const supabase = getSupabaseServerClient();
  const now = Date.now();
  const ipSince = new Date(now - IP_LIMIT.windowMs).toISOString();
  const globalSince = new Date(now - GLOBAL_LIMIT.windowMs).toISOString();

  const [ipHits, globalHits] = await Promise.all([
    supabase.from("unlock_attempts").select("created_at").eq("ip", ip)
      .gte("created_at", ipSince).order("created_at", { ascending: true }),
    supabase.from("unlock_attempts").select("created_at", { count: "exact" })
      .gte("created_at", globalSince).order("created_at", { ascending: true }).limit(1),
  ]);
  if (ipHits.error || globalHits.error) throw new Error("Couldn't check unlock attempts");

  const wait = (oldest: string, windowMs: number) =>
    Math.max(1, Math.ceil((new Date(oldest).getTime() + windowMs - now) / 60_000));

  if ((globalHits.count ?? 0) >= GLOBAL_LIMIT.max && globalHits.data?.[0]) {
    return { waitMinutes: wait(globalHits.data[0].created_at, GLOBAL_LIMIT.windowMs), triesLeft: 0 };
  }
  if (ipHits.data.length >= IP_LIMIT.max) {
    return { waitMinutes: wait(ipHits.data[0].created_at, IP_LIMIT.windowMs), triesLeft: 0 };
  }
  return { waitMinutes: 0, triesLeft: IP_LIMIT.max - ipHits.data.length };
}

export async function recordFailedUnlock(ip: string) {
  const supabase = getSupabaseServerClient();
  await supabase.from("unlock_attempts").insert({ ip });
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  await supabase.from("unlock_attempts").delete().lt("created_at", dayAgo);
}
