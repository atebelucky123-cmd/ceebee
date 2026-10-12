"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "../components/Logo";

const LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export default function UnlockPage() {
  const [pin, setPin] = useState("");
  const pinRef = useRef("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [lockedFor, setLockedFor] = useState(0);

  const submit = useCallback(async (code: string) => {
    setBusy(true);
    setMessage(null);
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: code, standalone }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
        return;
      }
      pinRef.current = "";
      setPin("");
      setShake((n) => n + 1);
      if (data.error === "wrong_pin" && data.triesLeft > 0) {
        setMessage(`That's not it. ${data.triesLeft} ${data.triesLeft === 1 ? "try" : "tries"} left.`);
      } else if (data.error === "locked_out" || data.error === "wrong_pin") {
        const mins = data.waitMinutes ?? 15;
        setLockedFor(mins);
        setMessage(`Too many tries. Try again in ${mins} min.`);
      } else {
        setMessage(data.error ?? "Something went wrong. Try again.");
      }
    } catch {
      pinRef.current = "";
      setPin("");
      setMessage("Couldn't reach CeeBee. Check your connection.");
    }
    setBusy(false);
  }, []);

  const press = useCallback(
    (key: string) => {
      // Read/write the ref, not state: fast typing fires several keydowns
      // before React re-renders, and each must see the previous digit.
      const current = pinRef.current;
      if (busy || lockedFor || (key !== "del" && current.length >= LENGTH)) return;
      const next = key === "del" ? current.slice(0, -1) : current + key;
      pinRef.current = next;
      setPin(next);
      if (next.length === LENGTH) submit(next);
    },
    [busy, lockedFor, submit]
  );

  // Laptop: type the digits, Backspace to correct.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <main className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Logo size={64} />
      <h1 className="font-display font-extrabold text-[30px] tracking-tight leading-none mt-6 text-center">
        CeeBee&apos;s locked
      </h1>
      <p className="text-muted text-[15px] mt-3 text-center max-w-[18rem]">
        Enter your 6-digit PIN and I&apos;ll remember this device.
      </p>

      <div
        key={shake}
        className={`flex gap-3.5 mt-9 ${shake ? "ceebee-shake" : ""}`}
        role="status"
        aria-label={`${pin.length} of ${LENGTH} digits entered`}
      >
        {Array.from({ length: LENGTH }, (_, i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full transition-colors ${
              i < pin.length ? "bg-honey" : "border-2 border-outline"
            }`}
          />
        ))}
      </div>

      <p className={`h-5 mt-5 text-sm text-center ${lockedFor ? "text-ember" : "text-soft"}`} aria-live="polite">
        {busy ? "Checking…" : message}
      </p>

      <div className="grid grid-cols-3 gap-3 mt-6 w-full max-w-[17rem]">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(k)}
              disabled={busy || !!lockedFor}
              aria-label={k === "del" ? "Delete" : k}
              className={`h-16 rounded-2xl flex items-center justify-center select-none transition-colors disabled:opacity-40 ${
                k === "del"
                  ? "text-muted text-sm font-semibold hover:text-soft"
                  : "bg-surface border border-line font-mono text-2xl text-cream hover:bg-raised active:bg-chip"
              }`}
            >
              {k === "del" ? "Delete" : k}
            </button>
          )
        )}
      </div>

      <p className="text-xs text-muted mt-10 text-center">
        <a href="/privacy" className="hover:text-soft">Privacy</a>
        <span className="mx-2">·</span>
        <a href="/terms" className="hover:text-soft">Terms</a>
      </p>
    </main>
  );
}
