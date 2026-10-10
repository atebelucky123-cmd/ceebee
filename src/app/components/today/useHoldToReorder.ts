"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Google Tasks-style "hold, then drag" reordering for touch and mouse.
//
// - Holding an item for HOLD_MS (without moving) picks it up.
// - Moving before that counts as a scroll, so the list still scrolls
//   normally under a quick swipe.
// - While an item is held, page scrolling is blocked and the list reorders
//   live under the finger; letting go commits the new order.
// - The click that follows a hold is swallowed, so lifting an item never
//   also toggles it done.

const HOLD_MS = 350;
const MOVE_TOLERANCE_PX = 8;

export function useHoldToReorder({
  ids,
  onPreview,
  onDrop,
}: {
  ids: string[];
  onPreview: (orderedIds: string[]) => void;
  onDrop: (orderedIds: string[]) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const order = useRef<string[]>(ids);
  const active = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const swallowClick = useRef(false);
  const cleanup = useRef<() => void>(() => {});

  // Keep the working order in sync with the list whenever we're not mid-drag.
  useEffect(() => {
    if (!active.current) order.current = ids;
  }, [ids]);

  useEffect(() => () => cleanup.current(), []);

  const begin = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      const target = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;

      const onMove = (ev: PointerEvent) => {
        if (!active.current) {
          // Moved before the hold completed: it's a scroll, not a drag.
          if (Math.hypot(ev.clientX - start.current.x, ev.clientY - start.current.y) > MOVE_TOLERANCE_PX) end(false);
          return;
        }
        // Find where the held item belongs given the finger's position,
        // comparing against the live midpoints of the other items.
        const others = order.current.filter((x) => x !== active.current);
        let index = others.length;
        for (let i = 0; i < others.length; i++) {
          const rect = elements.current.get(others[i])?.getBoundingClientRect();
          if (rect && ev.clientY < rect.top + rect.height / 2) {
            index = i;
            break;
          }
        }
        const next = [...others.slice(0, index), active.current, ...others.slice(index)];
        if (next.join() !== order.current.join()) {
          order.current = next;
          onPreview(next);
        }
      };

      // Only a non-passive touchmove can stop the page scrolling under a
      // held item.
      const onTouchMove = (ev: TouchEvent) => {
        if (active.current) ev.preventDefault();
      };

      const onUp = () => end(true);

      const end = (commit: boolean) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("touchmove", onTouchMove);
        if (active.current && commit) {
          swallowClick.current = true;
          setTimeout(() => (swallowClick.current = false), 400);
          onDrop(order.current);
        }
        active.current = null;
        setDraggingId(null);
      };
      cleanup.current = () => end(false);

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      window.addEventListener("touchmove", onTouchMove, { passive: false });

      timer.current = setTimeout(() => {
        active.current = id;
        order.current = ids;
        setDraggingId(id);
        try {
          target.setPointerCapture(pointerId);
        } catch {
          // pointer already released -- harmless
        }
        navigator.vibrate?.(15);
      }, HOLD_MS);
    },
    [ids, onPreview, onDrop]
  );

  // Spread onto each reorderable item.
  const bind = useCallback(
    (id: string) => ({
      ref: (el: HTMLElement | null) => {
        if (el) elements.current.set(id, el);
        else elements.current.delete(id);
      },
      onPointerDown: (e: React.PointerEvent) => begin(id, e),
      // Long-press would otherwise open the browser's context menu.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onClickCapture: (e: React.MouseEvent) => {
        if (swallowClick.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
    }),
    [begin]
  );

  return { draggingId, bind };
}
