"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Whether a media query matches. The server and the first client render see `onServer`. */
export function useMediaQuery(query: string, onServer: boolean): boolean {
  return useSyncExternalStore(
    useCallback(
      (listener) => {
        const media = matchMedia(query);
        media.addEventListener("change", listener);
        return () => media.removeEventListener("change", listener);
      },
      [query],
    ),
    () => matchMedia(query).matches,
    () => onServer,
  );
}
