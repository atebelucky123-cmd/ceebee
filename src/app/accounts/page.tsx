"use client";

import { useEffect, useState } from "react";
import VoicePicker from "../components/VoicePicker";

type Account = { email: string; label: string };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        // A failed lookup (e.g. the database is unreachable) used to look
        // exactly like "no accounts connected" -- say what actually happened.
        setLoadError(data.error ? "Couldn't reach CeeBee's database, so your connected accounts can't be shown right now." : null);
        setAccounts(data.accounts ?? []);
      })
      .catch(() => {
        setLoadError("Couldn't load your accounts. Check your connection.");
        setAccounts([]);
      });
  }

  useEffect(load, []);

  function startEditing(a: Account) {
    setEditing(a.email);
    setDraftLabel(a.label);
  }

  async function saveLabel(email: string) {
    const label = draftLabel.trim();
    if (!label) {
      setEditing(null);
      return;
    }
    setAccounts((prev) =>
      prev ? prev.map((a) => (a.email === email ? { ...a, label } : a)) : prev
    );
    setEditing(null);
    await fetch("/api/accounts/rename", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, label }),
    });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 pt-[max(1.75rem,env(safe-area-inset-top))] lg:pt-9 pb-3 flex items-center gap-3">
        <h1 className="font-display font-extrabold text-[32px] lg:text-[40px] tracking-tight leading-none flex-1">Accounts</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3">
        <VoicePicker />
        <h2 className="text-[17px] font-bold pt-4">Google accounts</h2>
        {accounts === null ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : loadError ? (
          <div className="text-ember text-sm text-center py-8">{loadError}</div>
        ) : accounts.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            No accounts connected yet.
          </div>
        ) : (
          accounts.map((a) => (
            <div
              key={a.email}
              className="bg-neutral-900 rounded-xl px-4 py-3 flex justify-between items-center gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{a.email}</div>
                {editing === a.email ? (
                  <input
                    autoFocus
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveLabel(a.email)}
                    onBlur={() => saveLabel(a.email)}
                    placeholder="e.g. Business, Personal 2"
                    className="bg-neutral-800 rounded px-2 py-1 text-xs mt-1 outline-none focus:ring-1 focus:ring-amber-400"
                  />
                ) : (
                  <div className="text-xs text-neutral-500">{a.label}</div>
                )}
              </div>
              {editing !== a.email && (
                <button
                  onClick={() => startEditing(a)}
                  className="bg-neutral-800 text-neutral-300 text-xs px-3 py-1.5 rounded-full shrink-0"
                >
                  Rename
                </button>
              )}
            </div>
          ))
        )}

        <a
          href="/api/auth/google?label=new-account"
          className="block text-center bg-amber-400 text-neutral-950 rounded-full py-2.5 font-medium text-sm mt-4"
        >
          + Connect a Google account
        </a>
        <p className="text-xs text-neutral-500 text-center px-4">
          Connect the account, then tap Rename to give it a nickname like
          Personal, Business, or CBM.
        </p>
      </main>
    </div>
  );
}
