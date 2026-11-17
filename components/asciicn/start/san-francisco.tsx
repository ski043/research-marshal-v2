"use client";

import { useRef } from "react";
import { SanFrancisco } from "@/components/asciicn/san-francisco";
import { useStartBoxes } from "@/components/asciicn/start/use-boxes";
import { useWide } from "@/components/asciicn/start/use-wide";

const DUSK = "#05081a";

export function SanFranciscoGround() {
  const wide = useWide();
  const canvas = useRef<HTMLDivElement>(null);
  const { column } = useStartBoxes(canvas);
  return (
    <div className="absolute inset-0" style={{ backgroundColor: DUSK }}>
      {wide ? (
        <SanFrancisco
          key="wide"
          ref={canvas}
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
        <SanFrancisco
          key="narrow"
          className="absolute inset-x-0 top-0 h-[28svh]"
          cell={5}
          frame={{ spread: 0.31, scale: 1.5 }}
          fadeBottom={0.2}
        />
      )}
    </div>
  );
}
