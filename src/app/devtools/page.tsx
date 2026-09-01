"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type ModelStats = {
  label: string;
  totalRequests: number;
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalToolCalls: number;
  avgLatencyMs: number;
};

type Stats = {
  byModel: Record<string, ModelStats>;
  recent: {
    id: string;
    model: string;
    prompt_tokens: number;
    output_tokens: number;
    tool_calls: number;
    latency_ms: number;
    created_at: string;
  }[];
};

export default function DevToolsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState<"idle" | "enabling" | "enabled" | "error">("idle");
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");

  useEffect(() => {
    fetch("/api/usage-stats")
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));

    fetch("/api/settings/model")
      .then((r) => r.json())
      .then((data) => {
        setCurrentModel(data.model);
        setModels(data.available ?? []);
      });
  }, []);

  async function changeModel(modelId: string) {
    setCurrentModel(modelId);
    await fetch("/api/settings/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId }),
    });
  }

  async function enablePushNotifications() {
    setPushStatus("enabling");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("error");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });

      setPushStatus("enabled");
    } catch {
      setPushStatus("error");
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link
          href="/chat"
          className="bg-amber-400 text-neutral-950 text-xs font-medium px-3 py-1.5 rounded-full"
        >
          Back
        </Link>
        <h1 className="font-semibold text-lg">Developer Tools</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4">
        <div>
          <h2 className="text-xs uppercase text-neutral-500 font-medium px-1 mb-2">
            AI Model
          </h2>
          <div className="space-y-2">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => changeModel(m.id)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm flex justify-between items-center ${
                  currentModel === m.id
                    ? "bg-amber-400 text-neutral-950 font-medium"
                    : "bg-neutral-900 text-neutral-300"
                }`}
              >
                {m.label}
                {currentModel === m.id && <span className="text-xs">Active</span>}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xs uppercase text-neutral-500 font-medium px-1 mb-2">
            Push Notifications
          </h2>
          <button
            onClick={enablePushNotifications}
            disabled={pushStatus === "enabling" || pushStatus === "enabled"}
            className="w-full bg-amber-400 text-neutral-950 rounded-xl py-3 text-sm font-medium disabled:opacity-50"
          >
            {pushStatus === "enabled"
              ? "Notifications enabled ✓"
              : pushStatus === "enabling"
              ? "Enabling…"
              : pushStatus === "error"
              ? "Failed — tap to retry"
              : "Enable reminder notifications"}
          </button>
        </div>

        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : !stats ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Couldn&apos;t load usage stats.
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-xs uppercase text-neutral-500 font-medium px-1 mb-2">
                Today&apos;s Usage by Model
              </h2>
              <div className="space-y-3">
                {Object.entries(stats.byModel).map(([modelId, m]) => (
                  <div key={modelId}>
                    <p className="text-xs text-neutral-400 px-1 mb-1">{m.label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Requests" value={m.totalRequests} />
                      <StatCard label="Tool calls" value={m.totalToolCalls} />
                      <StatCard label="Prompt tokens" value={m.totalPromptTokens} />
                      <StatCard label="Output tokens" value={m.totalOutputTokens} />
                      <StatCard label="Avg latency" value={`${m.avgLatencyMs}ms`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xs uppercase text-neutral-500 font-medium px-1 mb-2">
                Recent Requests
              </h2>
              <div className="bg-neutral-900 rounded-2xl divide-y divide-neutral-800">
                {stats.recent.length === 0 ? (
                  <p className="text-neutral-500 text-sm text-center py-6">
                    No requests logged today yet.
                  </p>
                ) : (
                  stats.recent.map((r) => (
                    <div key={r.id} className="px-4 py-2.5 text-xs flex justify-between">
                      <span className="text-neutral-400">
                        {new Date(r.created_at).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-neutral-500 truncate max-w-[80px]">{r.model}</span>
                      <span className="text-neutral-300">
                        {r.prompt_tokens ?? 0}+{r.output_tokens ?? 0} tok
                      </span>
                      <span className="text-neutral-500">{r.tool_calls} tools</span>
                      <span className="text-neutral-500">{r.latency_ms}ms</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="text-xs uppercase text-neutral-500 font-medium px-1 mb-2">
                Links
              </h2>
              <div className="space-y-2">
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-neutral-900 rounded-xl px-4 py-3 text-sm text-amber-400"
                >
                  Open Supabase Dashboard
                </a>
                <a
                  href="https://vercel.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-neutral-900 rounded-xl px-4 py-3 text-sm text-amber-400"
                >
                  Open Vercel Dashboard
                </a>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-neutral-900 rounded-xl px-3 py-3">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  );
}
