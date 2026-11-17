"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 640px)";

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/**
 * Whether the screen is at least as wide as the `sm` breakpoint. A ground reframes its
 * picture below it. Client only: the grounds never render on the server.
 */
export const useWide = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
