"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();
// Holds a value for this page when localStorage refuses it, as in a private window.
const memory = new Map<string, string>();

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

function subscribe(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  listeners.set(key, set);
  set.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    set.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/**
 * One localStorage entry as state. The server and the first client render see `null`, so
 * hydration matches; the stored value arrives right after.
 */
export function useStored(
  key: string,
): readonly [string | null, (value: string) => void] {
  const value = useSyncExternalStore(
    useCallback((listener) => subscribe(key, listener), [key]),
    () => read(key),
    () => null,
  );
  const write = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        memory.set(key, next);
      }
      notify(key);
    },
    [key],
  );
  return [value, write];
}
