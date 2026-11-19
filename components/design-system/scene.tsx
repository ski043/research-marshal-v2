"use client";

import dynamic from "next/dynamic";
import type { SanFranciscoProps } from "@/components/asciicn/san-francisco";
import { cn } from "@/lib/utils";

// Its own chunk, as on the start screen: the WebGL engine loads after the page.
const SanFrancisco = dynamic(
  () =>
    import("@/components/asciicn/san-francisco").then(
      (mod) => mod.SanFrancisco,
    ),
  { ssr: false },
);

/**
 * The scene of the start screen in a panel of its own. The scene paints its own night,
 * so the panel is dark in both themes. Decorative: hidden from assistive technology.
 */
export function Scene({
  className,
  ...scene
}: { className?: string } & Pick<
  SanFranciscoProps,
  "cell" | "frame" | "fadeBottom"
>) {
  return (
    <div
      aria-hidden
      data-scene
      className={cn(
        "dark relative isolate overflow-hidden rounded-2xl border bg-sidebar",
        className,
      )}
    >
      <SanFrancisco className="absolute inset-0" {...scene} />
    </div>
  );
}
