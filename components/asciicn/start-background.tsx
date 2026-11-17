"use client";

import dynamic from "next/dynamic";

// Its own chunk that loads after the prompt box, so the WebGL engine stays out of the
// first load of the start screen.
const SanFranciscoGround = dynamic(
  () =>
    import("@/components/asciicn/start/san-francisco").then(
      (mod) => mod.SanFranciscoGround,
    ),
  { ssr: false },
);

/**
 * The picture behind the start screen: the Golden Gate at dusk. It fills the nearest
 * positioned ancestor, sits under the content and takes no pointer events. Decorative,
 * so it is hidden from assistive technology.
 */
export function StartBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <SanFranciscoGround />
    </div>
  );
}
