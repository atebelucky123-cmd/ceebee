"use client";

import { useEffect, useState } from "react";

type Account = { email: string; label: string };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => setAccounts([]));
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800">
        <h1 className="font-semibold text-lg">Accounts</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3">
        {accounts === null ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            No accounts connected yet.
          </div>
        ) : (
          accounts.map((a) => (
            <div
              key={a.email}
              className="bg-neutral-900 rounded-xl px-4 py-3 flex justify-between items-center"
            >
              <div>
                <div className="text-sm font-medium">{a.email}</div>
                <div className="text-xs text-neutral-500 capitalize">
                  {a.label}
                </div>
              </div>
            </div>
          ))
        )}

        <a
          href="/api/auth/google?label=new"
          className="block text-center bg-amber-400 text-neutral-950 rounded-full py-2.5 font-medium text-sm mt-4"
        >
          + Connect a Google account
        </a>
        <p className="text-xs text-neutral-500 text-center px-4">
          Tip: visit /api/auth/google?label=personal or ?label=business to
          tag which account you're connecting.
        </p>
      </main>
    </div>
  );
}
