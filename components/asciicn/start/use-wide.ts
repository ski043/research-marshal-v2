"use client";

import { type RefObject, useSyncExternalStore } from "react";

// The text column is 42rem wide. A picture beside it needs about 9rem on each side.
const ROOMY = 960;
// Before the ground is in the document, the screen it will fill already is: the scene
// loads after the page. The screen has the width that the sidebar leaves, wide or as a rail.
const guess = () =>
  (document.querySelector("main")?.clientWidth ?? window.innerWidth) >= ROOMY;

/**
 * Whether `ground` has room for a picture beside the text column. A ground reframes
 * its picture when it has none: above or below the text instead.
 */
export function useRoomy(ground: RefObject<HTMLElement | null>): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new ResizeObserver(onChange);
      if (ground.current) observer.observe(ground.current);
      return () => observer.disconnect();
    },
    () => (ground.current ? ground.current.clientWidth >= ROOMY : guess()),
    () => true,
  );
}
