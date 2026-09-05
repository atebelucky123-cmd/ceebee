"use client";

import { useEffect, useRef, useState } from "react";

// A self-built calendar dropdown, used everywhere a date is picked
// (Schedule tab, Add Event, Reminders) instead of the native
// <input type="date">. The native control only opens its calendar when you
// click its tiny icon at the far right -- clicking the digits themselves
// just selects that segment for typing, which is what made the Schedule
// tab's picker feel "unclickable"/broken. This is click-a-day-on-a-grid
// only -- there's no free-typing path, so it also can't produce the
// invalid/empty in-progress values that used to crash calRangeFor.

const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  // Guards against a technically-well-formed but nonexistent date, e.g.
  // "2026-02-30" -- JS would silently roll that over to March 2nd.
  const check = new Date(year, month, day);
  if (check.getFullYear() !== year || check.getMonth() !== month || check.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function formatDisplay(value: string): string {
  const parsed = parseDateKey(value);
  if (!parsed) return "Select a date";
  return new Date(parsed.year, parsed.month, parsed.day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DatePicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (date: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fallbackNow = new Date();
  const parsed =
    parseDateKey(value) ?? {
      year: fallbackNow.getFullYear(),
      month: fallbackNow.getMonth(),
      day: fallbackNow.getDate(),
    };
  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);

  // Jump the visible month back to match `value` whenever the picker is
  // (re)opened, so it doesn't stay stuck wherever you last scrolled it.
  useEffect(() => {
    if (!open) return;
    const p = parseDateKey(value);
    if (p) {
      setViewYear(p.year);
      setViewMonth(p.month);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function goToMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  const startWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm text-left outline-none focus:ring-2 focus:ring-amber-400 flex items-center justify-between"
      >
        <span>{formatDisplay(value)}</span>
        <span className="text-neutral-500">📅</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 bg-neutral-900 border border-neutral-700 rounded-xl p-3 shadow-xl w-72">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => goToMonth(-1)}
              className="text-neutral-400 hover:text-neutral-200 px-2 py-1"
            >
              ‹
            </button>
            <span className="text-sm font-medium">
              {new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              type="button"
              onClick={() => goToMonth(1)}
              className="text-neutral-400 hover:text-neutral-200 px-2 py-1"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-neutral-500 mb-1">
            {WEEKDAY_HEADERS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} />;
              const key = toDateKey(viewYear, viewMonth, day);
              const isSelected = key === value;
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  className={`text-xs rounded-lg py-1.5 transition-colors ${
                    isSelected
                      ? "bg-amber-400 text-neutral-950 font-semibold"
                      : isToday
                      ? "text-amber-400 font-semibold hover:bg-neutral-800"
                      : "text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              onChange(todayKey);
              setOpen(false);
            }}
            className="mt-2 text-xs text-amber-400 font-medium"
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}
