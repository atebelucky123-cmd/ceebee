"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCeeBeeChat } from "../components/chat/useCeeBeeChat";
import CeeBeePanel from "../components/today/CeeBeePanel";
import ScheduleManager from "../components/today/ScheduleManager";
import PlayMyDay from "../components/today/PlayMyDay";
import {
  InsightCard, NextUpBanner, RemindersCard, StatsCard, TasksCard, WeatherIcon,
  type Brief,
} from "../components/today/TodayCards";

type MobileTab = "myday" | "schedule" | "stats";

function localDateKey() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Today -- the Hive "Command Center". CeeBee's brief and what she's noticed
// lead; the plan, tasks and reminders sit underneath; on wide screens she's
// in a column on the right, ready to act on any of it.
export default function TodayPage() {
  const router = useRouter();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefError, setBriefError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<MobileTab>("myday");
  const coordsRef = useRef<{ lat: number; lon: number } | null>(null);

  const loadBrief = useCallback(() => {
    const c = coordsRef.current;
    const qs = c ? `?lat=${c.lat}&lon=${c.lon}` : "";
    fetch(`/api/brief${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setBrief(d);
        setBriefError(false);
      })
      .catch(() => setBriefError(true));
  }, []);

  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      loadBrief();
    };
    // Prefer real location (rain warnings for where Shina actually is), but
    // never hold the screen hostage to a slow or denied permission prompt.
    const timer = setTimeout(go, 2500);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          coordsRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          clearTimeout(timer);
          go();
        },
        () => {
          clearTimeout(timer);
          go();
        },
        { timeout: 2500 }
      );
    } else {
      clearTimeout(timer);
      go();
    }
    // Keep "in 25 min" honest.
    const interval = setInterval(loadBrief, 5 * 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [loadBrief]);

  // A fresh Today conversation each day; yesterday's stays in Chats. When
  // CeeBee changes something from the panel (moved the gym, ticked a task),
  // refresh the plan around her so the screen matches what she said.
  const chat = useCeeBeeChat({
    storageKey: `ceebee-today-conversation-${localDateKey()}`,
    onReply: (reply) => {
      if (reply.cards.some((c) => c.type === "actions" && c.items.some((i) => i.ok))) {
        setRefreshKey((k) => k + 1);
        loadBrief();
      }
    },
  });

  const onDataChanged = useCallback(() => loadBrief(), [loadBrief]);

  // Insight actions: talk to CeeBee in the side panel when it's on screen,
  // otherwise hand the request to the Chat screen.
  function act(prompt: string) {
    if (window.matchMedia("(min-width: 1280px)").matches) chat.send(prompt);
    else router.push(`/chat?q=${encodeURIComponent(prompt)}`);
  }

  const now = brief?.now ?? "";
  const laterToday = (brief?.today ?? []).filter((i) => !i.done && !i.cleared && (!i.start || i.start >= now) && i.id !== brief?.nextUp?.item.id);

  return (
    <div className="flex flex-1 min-h-0">
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* ---------- Desktop ---------- */}
        <div className="hidden lg:flex flex-col gap-7 px-10 py-9 min-h-full">
          <div className="flex justify-between items-end gap-6">
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="font-mono text-[13px] text-muted">{brief?.dateLabel ?? " "}</div>
              <h1 className="m-0 font-display font-extrabold text-[44px] tracking-tight leading-none truncate">
                {brief?.greeting ?? "Hello, Shina"}
              </h1>
            </div>
            <div className="flex items-center gap-3 shrink-0">
            <PlayMyDay brief={brief} />
            {brief?.weather && (
              <Link
                href="/weather"
                className="flex items-center gap-3 px-4 py-2.5 rounded-[14px] bg-surface border border-line-strong text-honey shrink-0"
              >
                <WeatherIcon condition={brief.weather.condition} />
                <span className="flex flex-col">
                  <span className="font-mono text-xl text-cream">{brief.weather.temp}°</span>
                  <span className="text-xs text-muted">
                    H {brief.weather.high}° · {brief.weather.note ?? brief.weather.condition}
                  </span>
                </span>
              </Link>
            )}
            </div>
          </div>

          {brief ? <NextUpBanner nextUp={brief.nextUp} /> : <div className="h-[118px] rounded-[20px] bg-surface animate-pulse" />}

          {/* What CeeBee noticed. Below xl there's no CeeBee column, so her
              brief comes inline too. */}
          {brief && (
            <div className={`flex-col gap-3 ${brief.insights.length ? "flex" : "flex xl:hidden"}`}>
              <div className="xl:hidden">
                <InsightCard insight={{ id: "brief", tone: "honey", text: brief.message }} onAct={act} />
              </div>
              {brief.insights.map((i) => (
                <InsightCard key={i.id} insight={i} onAct={act} />
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
            <ScheduleManager refreshKey={refreshKey} onChanged={onDataChanged} />
            <div className="flex flex-col gap-6 min-h-0">
              <TasksCard refreshKey={refreshKey} />
              <RemindersCard items={brief?.today ?? []} />
              <StatsCard />
            </div>
          </div>
        </div>

        {/* ---------- Mobile ---------- */}
        <div className="lg:hidden flex flex-col gap-[18px] px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-6">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="font-mono text-xs text-muted">
                {brief ? `${brief.dateLabel.replace(/ ([A-Z]+)$/, (m) => m.slice(0, 4))}${brief.weather ? ` · ${brief.weather.temp}°` : ""}` : " "}
              </div>
              <h1 className="m-0 font-display font-extrabold text-[32px] tracking-tight leading-[1.05]">
                {brief ? brief.greeting.replace("Good ", "").replace(/^\w/, (c) => c.toUpperCase()) : "Hello, Shina"}
              </h1>
            </div>
            <Link
              href="/accounts"
              aria-label="Accounts"
              className="w-11 h-11 rounded-full border border-line-strong bg-surface flex items-center justify-center font-bold"
            >
              S
            </Link>
          </div>

          <PlayMyDay brief={brief} size="sm" />

          <div className="flex gap-2" role="tablist" aria-label="Today views">
            {(
              [
                ["myday", "My day"],
                ["schedule", "Schedule"],
                ["stats", "Stats"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`h-9 px-4 rounded-full text-sm font-semibold ${
                  tab === key ? "bg-cream text-ground" : "border border-line-strong text-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "myday" && (
            <>
              {brief ? <NextUpBanner nextUp={brief.nextUp} size="sm" /> : <div className="h-36 rounded-[20px] bg-surface animate-pulse" />}

              {briefError && !brief && (
                <div className="text-sm text-muted">Couldn&apos;t load your brief. Pull down or try again shortly.</div>
              )}

              {brief && (
                <div className="flex flex-col gap-3">
                  {brief.insights.length > 0 ? (
                    brief.insights.map((i) => <InsightCard key={i.id} insight={i} onAct={act} />)
                  ) : (
                    <InsightCard insight={{ id: "brief", tone: "honey", text: brief.message }} onAct={act} />
                  )}
                </div>
              )}

              <div className="flex justify-between items-center">
                <h2 className="m-0 text-base font-bold">Later today</h2>
                <span className="font-mono text-xs text-muted">{laterToday.length} left</span>
              </div>
              <div className="flex flex-col -mt-2">
                {laterToday.length === 0 ? (
                  <p className="text-sm text-muted py-2">Nothing else on. </p>
                ) : (
                  laterToday.map((i, idx) => (
                    <div
                      key={i.id}
                      className={`flex gap-3.5 items-center min-h-[52px] ${idx < laterToday.length - 1 ? "border-b border-line" : ""}`}
                    >
                      <span className="font-mono text-[13px] text-muted w-11 shrink-0">{i.start ?? "—"}</span>
                      <span className="flex-1 min-w-0 text-[15px] truncate">{i.title}</span>
                      {i.rainChance !== null && i.rainChance >= 50 && !i.meetLink && (
                        <span className="text-xs font-semibold text-ember">Rain</span>
                      )}
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          (i.priority ?? 0) >= 5 ? "bg-ember" : (i.priority ?? 0) === 4 ? "bg-honey" : "bg-neutral-600"
                        }`}
                        aria-label={i.priority ? `Priority ${i.priority}` : "Calendar event"}
                      />
                    </div>
                  ))
                )}
              </div>

              <TasksCard refreshKey={refreshKey} limit={4} compact />
            </>
          )}

          {tab === "schedule" && <ScheduleManager refreshKey={refreshKey} onChanged={onDataChanged} bare />}
          {tab === "stats" && <StatsCard />}
        </div>
      </main>

      <CeeBeePanel chat={chat} brief={brief} />
    </div>
  );
}
