"use client";

import { useRef } from "react";
import { Lighthouse } from "@/components/asciicn/lighthouse";
import { useStartBoxes } from "@/components/asciicn/start/use-boxes";

export function LighthouseGround() {
  const canvas = useRef<HTMLDivElement>(null);
  const { greeting } = useStartBoxes(canvas);
  return (
    <div className="absolute inset-x-2 top-14 h-[calc(50%-3.5rem)] overflow-hidden rounded-2xl lg:inset-x-3 lg:top-3 lg:h-[calc(50%-4.75rem)]">
      {/* Taller than the window: the frame crops the near sea, so the horizon sits under the greeting. */}
      <Lighthouse
        ref={canvas}
        className="absolute inset-x-0 top-0 h-[130%]"
        tint={1}
        calm={{ box: greeting, grow: 14, fade: 70 }}
      />
    </div>
  );
}
