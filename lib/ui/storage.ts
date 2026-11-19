"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();
// Holds a value for this page while localStorage refuses to save it: a private window,
// or a full quota. It wins over the older value that storage still returns.
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

export function readStored(key: string): string | null {
  const unsaved = memory.get(key);
  if (unsaved !== undefined) return unsaved;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
  notify(key);
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
    () => readStored(key),
    () => null,
  );
  const write = useCallback((next: string) => writeStored(key, next), [key]);
  return [value, write];
}
