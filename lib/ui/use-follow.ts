"use client";

import { type RefObject, useEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 64;

/**
 * Keeps a scroll container at its bottom while `signal` changes, as long as the user is
 * there. It stops when the user scrolls up and starts again when they come back down.
 */
export function useFollow<T extends HTMLElement>(
  signal: unknown,
  enabled: boolean,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const following = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const top = el.scrollTop;
      const nearBottom =
        el.scrollHeight - top - el.clientHeight < NEAR_BOTTOM_PX;
      // Only a scroll upward leaves the bottom on purpose. The smooth scroll of this
      // hook moves down through positions that are far from the bottom too.
      if (nearBottom) following.current = true;
      else if (top < last - 1) following.current = false;
      last = top;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `signal` is the trigger; the effect reads only the element
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !following.current) return;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [signal, enabled]);

  return ref;
}
