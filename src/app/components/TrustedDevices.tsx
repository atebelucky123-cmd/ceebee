"use client";

import { useEffect, useState } from "react";

type Device = { id: string; label: string; created_at: string; last_used_at: string; current: boolean };

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 5) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Devices that have unlocked CeeBee with the PIN. Remove revokes one at once;
// it'll need the PIN again to get back in.
export default function TrustedDevices() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError("Couldn't load your devices right now.");
        setDevices(d.devices ?? []);
      })
      .catch(() => {
        setError("Couldn't load your devices. Check your connection.");
        setDevices([]);
      });
  }, []);

  async function remove(d: Device) {
    setConfirming(null);
    const res = await fetch(`/api/devices/${d.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setError(`Couldn't remove ${d.label}. Try again.`);
      return;
    }
    if (d.current) {
      window.location.replace("/unlock");
      return;
    }
    setDevices((prev) => prev?.filter((x) => x.id !== d.id) ?? prev);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-bold pt-4">Devices</h2>
      <p className="text-xs text-muted -mt-1">
        These can use CeeBee without the PIN. On iPhone, Safari and the Home Screen app each count as their own device.
      </p>
      {devices === null ? (
        <div className="text-muted text-sm text-center py-6">Loading…</div>
      ) : (
        <>
          {error && <div className="text-ember text-sm text-center py-2">{error}</div>}
          {devices.map((d) => (
            <div key={d.id} className="bg-surface border border-line rounded-xl px-4 py-3 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {d.label}
                  {d.current && <span className="text-honey font-semibold"> · This device</span>}
                </div>
                <div className="text-xs text-muted">
                  Last used <span className="font-mono">{d.current ? "now" : ago(d.last_used_at)}</span>
                  {" · "}added <span className="font-mono">{new Date(d.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                </div>
              </div>
              {confirming === d.id ? (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => remove(d)} className="bg-ember text-ground text-xs font-semibold px-3 py-1.5 rounded-full">
                    {d.current ? "Lock it" : "Remove"}
                  </button>
                  <button onClick={() => setConfirming(null)} className="bg-raised text-soft text-xs px-3 py-1.5 rounded-full">
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(d.id)}
                  className="shrink-0 bg-raised text-soft text-xs px-3 py-1.5 rounded-full hover:text-cream"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
