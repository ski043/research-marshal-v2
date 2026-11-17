"use client";

import { useRef } from "react";
import { Lighthouse } from "@/components/asciicn/lighthouse";
import { useStartBoxes } from "@/components/asciicn/start/use-boxes";
import { useWide } from "@/components/asciicn/start/use-wide";

export function LighthouseGround() {
  const canvas = useRef<HTMLDivElement>(null);
  const { greeting } = useStartBoxes(canvas);
  const wide = useWide();
  return (
    <div className="absolute inset-x-2 top-14 h-[calc(50%-3.5rem)] overflow-hidden rounded-2xl lg:inset-x-3 lg:top-3 lg:h-[calc(50%-4.75rem)]">
      {/* From the sm breakpoint up the scene is taller than the window. The window
          crops the sea, so the tower stands large against the sky. */}
      <Lighthouse
        ref={canvas}
        className="absolute inset-x-0 top-0 h-full sm:h-[160%]"
        tint={1}
        axis={wide ? 0.8 : 0.84}
        calm={{
          box: greeting,
          strength: 0.8,
          grow: 4,
          // The tower stands close to the greeting on a phone, so the calm ends sooner.
          fade: wide ? 130 : 16,
        }}
      />
    </div>
  );
}
