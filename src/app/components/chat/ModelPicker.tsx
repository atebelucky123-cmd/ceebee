"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "../Icons";

type Model = { id: string; nickname: string; hint: string };

const MODEL_EVENT = "ceebee:model";
const announce = (id: string | null) => id && window.dispatchEvent(new CustomEvent(MODEL_EVENT, { detail: id }));

// Quick model switch in the chat box: "Flash" / "Smart" (real names stay in
// Developer tools). It changes the same saved setting, so the two stay in sync.
export default function ModelPicker({ compact }: { compact?: boolean }) {
  const [models, setModels] = useState<Model[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/settings/model")
      .then((r) => r.json())
      .then((d) => {
        setModels(d.available ?? []);
        setCurrent(d.model ?? null);
      })
      .catch(() => {});
    // Several pickers can be mounted at once (desktop + phone composers);
    // keep them all showing the same choice.
    const onChange = (e: Event) => setCurrent((e as CustomEvent<string>).detail);
    window.addEventListener(MODEL_EVENT, onChange);
    return () => window.removeEventListener(MODEL_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function choose(id: string) {
    setOpen(false);
    if (id === current) return;
    const previous = current;
    announce(id);
    const res = await fetch("/api/settings/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: id }),
    }).catch(() => null);
    if (!res?.ok) announce(previous);
  }

  const selected = models.find((m) => m.id === current);
  if (!selected) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${selected.nickname}`}
        className={`flex items-center gap-1 rounded-lg text-soft hover:text-cream hover:bg-raised font-semibold ${
          compact ? "h-8 px-2 text-[13px]" : "h-9 px-2.5 text-sm"
        }`}
      >
        {selected.nickname}
        <ChevronDownIcon size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Choose model"
          className="absolute bottom-full right-0 mb-2 w-56 z-30 rounded-2xl bg-raised border border-line-strong p-1.5 shadow-xl shadow-black/50"
        >
          {models.map((m) => (
            <button
              key={m.id}
              role="option"
              aria-selected={m.id === current}
              onClick={() => choose(m.id)}
              className="w-full flex items-center gap-3 text-left rounded-xl px-3 py-2.5 hover:bg-chip"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-cream">{m.nickname}</span>
                <span className="block text-xs text-muted">{m.hint}</span>
              </span>
              {m.id === current && <CheckIcon size={16} className="text-honey shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
