"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "./Logo";
import {
  TodayIcon, ChatIcon, CalendarIcon, InboxIcon, TasksIcon, NotesIcon, BellIcon,
  CloudIcon, MoreIcon, UserIcon, CogIcon, CloseIcon,
} from "./Icons";

const PRIMARY = [
  { href: "/dashboard", label: "Today", Icon: TodayIcon },
  { href: "/chat", label: "Chat", Icon: ChatIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/emails", label: "Inbox", Icon: InboxIcon, badge: true },
  { href: "/tasks", label: "Tasks", Icon: TasksIcon },
  { href: "/notes", label: "Notes", Icon: NotesIcon },
  { href: "/reminders", label: "Reminders", Icon: BellIcon },
  { href: "/weather", label: "Weather", Icon: CloudIcon },
];

const SECONDARY = [
  { href: "/accounts", label: "Accounts", Icon: UserIcon },
  { href: "/devtools", label: "Developer tools", Icon: CogIcon },
];

// Pages that lay themselves out edge-to-edge (multi-column on desktop).
// Everything else is a single readable column, centred.
const FULL_BLEED = ["/dashboard", "/chat"];

function useUnreadCount(enabled: boolean) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      fetch("/api/emails/unread-count")
        .then((r) => r.json())
        .then((d) => !cancelled && setUnread(d.unread ?? 0))
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);
  return unread;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  // The lock screen stands alone: no nav, and no API calls that would 401.
  const locked = pathname === "/unlock";
  const unread = useUnreadCount(!locked);
  if (locked) return <div className="flex h-full min-h-0 flex-col">{children}</div>;
  const onChat = pathname.startsWith("/chat");
  const fullBleed = FULL_BLEED.some((p) => pathname.startsWith(p));

  return (
    <div className="flex h-full min-h-0">
      {onChat ? <RailNav pathname={pathname} unread={unread} /> : <SideNav pathname={pathname} unread={unread} />}

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className={`flex-1 min-h-0 flex flex-col ${fullBleed ? "" : "w-full max-w-3xl mx-auto"}`}>
          {children}
        </div>
        {!onChat && <BottomNav pathname={pathname} unread={unread} />}
      </div>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SideNav({ pathname, unread }: { pathname: string; unread: number }) {
  return (
    <nav
      aria-label="Main"
      className="hidden lg:flex w-60 shrink-0 flex-col gap-1.5 border-r border-line px-4 py-6 overflow-y-auto"
    >
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 pb-5">
        <Logo size={34} />
        <span className="font-display font-extrabold text-[22px] tracking-tight">CeeBee</span>
      </Link>
      {PRIMARY.map(({ href, label, Icon, badge }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 h-11 px-3 rounded-xl text-[15px] transition-colors ${
              active ? "bg-honey text-ground font-semibold" : "text-soft font-medium hover:bg-surface"
            }`}
          >
            <Icon />
            <span className="flex-1">{label}</span>
            {badge && unread > 0 && (
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded-full ${
                  active ? "bg-ground/15" : "bg-chip text-cream"
                }`}
              >
                {unread}
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col gap-1 pt-4">
        <div className="text-xs font-semibold tracking-[0.06em] text-muted px-3 pb-1">SETTINGS</div>
        {SECONDARY.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 h-10 px-3 rounded-xl text-sm ${
                active ? "bg-surface text-cream font-semibold border border-line-strong" : "text-muted hover:text-soft"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// The collapsed 76px rail used on the Chat screen, so the conversation list
// and thread get the room (matches "A · Hive -- Desktop · Chat").
function RailNav({ pathname, unread }: { pathname: string; unread: number }) {
  return (
    <nav
      aria-label="Main"
      className="hidden lg:flex w-[76px] shrink-0 flex-col items-center gap-2 border-r border-line py-5"
    >
      <Link href="/dashboard" className="mb-3" aria-label="CeeBee home">
        <Logo size={36} />
      </Link>
      {PRIMARY.slice(0, 6).map(({ href, label, Icon, badge }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            title={label}
            className={`relative w-12 h-12 rounded-[14px] flex items-center justify-center ${
              active ? "bg-honey text-ground" : "text-soft hover:bg-surface"
            }`}
          >
            <Icon />
            {badge && unread > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-honey ring-2 ring-ground" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNav({ pathname, unread }: { pathname: string; unread: number }) {
  // Remembers which page the sheet was opened on, so navigating anywhere
  // closes it without an effect.
  const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
  const moreOpen = moreOpenOn === pathname;
  const setMoreOpen = (open: boolean) => setMoreOpenOn(open ? pathname : null);
  const moreItems = [...PRIMARY.slice(4), ...SECONDARY];
  const moreActive = moreItems.some((i) => isActive(pathname, i.href));

  const tab = (href: string, label: string, Icon: typeof TodayIcon, badge?: number) => {
    const active = isActive(pathname, href);
    return (
      <Link
        href={href}
        className={`relative w-16 h-[52px] flex flex-col items-center justify-center gap-[3px] text-[11px] font-semibold ${
          active ? "text-honey" : "text-muted"
        }`}
      >
        <Icon size={22} />
        {label}
        {!!badge && (
          <span className="absolute top-1 right-3 min-w-4 h-4 px-1 rounded-full bg-honey text-ground font-mono text-[10px] flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Main"
        className="lg:hidden shrink-0 border-t border-line bg-ground flex justify-around items-center px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {tab("/dashboard", "Today", TodayIcon)}
        {tab("/calendar", "Calendar", CalendarIcon)}
        <Link
          href="/chat"
          aria-label="Ask CeeBee"
          className="w-[60px] h-[60px] -mt-7 rounded-[20px] bg-honey border-4 border-ground flex items-center justify-center shadow-lg shadow-black/40"
        >
          <Logo size={30} tile={false} color="#12100D" />
        </Link>
        {tab("/emails", "Inbox", InboxIcon, unread)}
        <button
          onClick={() => setMoreOpen(true)}
          className={`w-16 h-[52px] flex flex-col items-center justify-center gap-[3px] text-[11px] font-semibold ${
            moreActive ? "text-honey" : "text-muted"
          }`}
        >
          <MoreIcon size={22} />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-label="More">
          <button aria-label="Close" className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
          <div className="relative bg-surface border-t border-line-strong rounded-t-3xl px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-chip" />
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="font-display font-extrabold text-xl">More</span>
              <button onClick={() => setMoreOpen(false)} aria-label="Close" className="w-10 h-10 flex items-center justify-center text-muted">
                <CloseIcon />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-2 rounded-2xl py-4 text-sm font-medium ${
                    isActive(pathname, href) ? "bg-honey text-ground" : "bg-raised text-soft"
                  }`}
                >
                  <Icon size={22} />
                  {label === "Developer tools" ? "Dev tools" : label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
