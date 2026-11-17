"use client";

import { useRef } from "react";
import { SanFrancisco } from "@/components/asciicn/san-francisco";
import { useStartBoxes } from "@/components/asciicn/start/use-boxes";
import { useRoomy } from "@/components/asciicn/start/use-wide";

export function SanFranciscoGround() {
  const ground = useRef<HTMLDivElement>(null);
  const roomy = useRoomy(ground);
  const { column, headroom } = useStartBoxes(ground);
  return (
    <div ref={ground} className="absolute inset-0">
      {roomy ? (
        // The towers stand left and right of the text and the deck runs under the chips.
        <SanFrancisco
          key="beside"
          className="absolute inset-0"
          frame={{
            horizon: -0.12,
            spread: 0.34,
            centre: 0.05,
            glow: 0.3,
            scale: 1.25,
          }}
          calm={{ box: column, grow: -24, fade: 100 }}
        />
      ) : (
        // No room beside the text: the whole bridge sits in a band above the greeting.
        <SanFrancisco
          key="above"
          className="absolute inset-x-0 top-0"
          style={{ height: Math.max(0, headroom - 8) }}
          cell={5}
          frame={{ spread: 0.31, scale: 1.5 }}
          fadeBottom={0.2}
        />
      )}
    </div>
  );
}
