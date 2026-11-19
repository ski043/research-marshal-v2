"use client";

import { useSyncExternalStore } from "react";
import { SPINNERS } from "@/lib/ascii/charsets";
import { cn } from "@/lib/utils";

const FRAMES = SPINNERS.braille;
const STILL = "⠶";
const INTERVAL_MS = 90;

// One timer turns every spinner on the page, so they stay in step.
let tick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (
    timer === null &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    timer = setInterval(() => {
      tick += 1;
      for (const each of listeners) each();
    }, INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** A Braille glyph that turns while something runs. It holds still under reduced motion. */
export function GlyphSpinner({ className }: { className?: string }) {
  const frame = useSyncExternalStore(
    subscribe,
    () => (timer === null ? STILL : (FRAMES[tick % FRAMES.length] ?? STILL)),
    () => FRAMES[0],
  );
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block w-[1ch] text-center font-mono leading-none text-primary-ink",
        className,
      )}
    >
      {frame}
    </span>
  );
}
