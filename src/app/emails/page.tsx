"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Email = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  accountEmail: string;
  accountLabel: string;
};

type Account = { email: string; label: string };

export default function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState<string | null>(null); // null = unified
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = filter ? `?label=${filter}` : "";
    fetch(`/api/emails${params}`)
      .then((r) => r.json())
      .then((data) => setEmails(data.emails ?? []))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link href="/dashboard" className="text-neutral-500 text-sm">
          ← Back
        </Link>
        <h1 className="font-semibold text-lg">Emails</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3">
        {accounts.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setFilter(null)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap ${
                filter === null
                  ? "bg-amber-400 text-neutral-950"
                  : "bg-neutral-900 text-neutral-400"
              }`}
            >
              All accounts
            </button>
            {accounts.map((a) => (
              <button
                key={a.label}
                onClick={() => setFilter(a.label)}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap capitalize ${
                  filter === a.label
                    ? "bg-amber-400 text-neutral-950"
                    : "bg-neutral-900 text-neutral-400"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : emails.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            No emails found. Connect a Google account first.
          </div>
        ) : (
          <div className="space-y-2">
            {emails.map((e) => (
              <div key={`${e.accountEmail}-${e.id}`} className="bg-neutral-900 rounded-xl px-4 py-3">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-sm truncate text-neutral-300 flex items-center gap-2">
                    {e.unread && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    )}
                    {e.from}
                  </span>
                  <span className="text-[10px] text-neutral-600 shrink-0 capitalize">
                    {e.accountLabel}
                  </span>
                </div>
                <div className="text-sm mt-0.5">{e.subject}</div>
                <p className="text-xs text-neutral-500 mt-1 line-clamp-1">
                  {e.snippet}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
