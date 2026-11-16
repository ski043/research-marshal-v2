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
  const atBottom = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      atBottom.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `signal` is the trigger; the effect reads only the element
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !atBottom.current) return;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [signal, enabled]);

  return ref;
}
