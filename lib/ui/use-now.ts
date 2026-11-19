"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const each of listeners) each();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * The current time, once a second, for running clocks. It is null on the server and in
 * the first client render: the server cannot know the clock of the browser.
 */
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => (timer === null ? null : now),
    () => null,
  );
}
