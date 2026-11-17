"use client";

import { useRef } from "react";
import { CanyonRiver } from "@/components/asciicn/canyon-river";
import { useStartBoxes } from "@/components/asciicn/start/use-boxes";
import { useRoomy } from "@/components/asciicn/start/use-wide";

// The horizon of the scene before its frame is drawn, as a share of the height from the top.
const ground = (horizon: number, sky: string, glow: string) => (
  <div
    className="absolute inset-0 opacity-60"
    style={{
      background: `linear-gradient(to bottom, #070c1a 0%, ${sky} ${horizon - 14}%, ${glow} ${horizon}%, #070c1a ${horizon + 5}%)`,
    }}
  />
);

function Canyon({ dusk }: { dusk: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const roomy = useRoomy(root);
  const { column } = useStartBoxes(root);
  // The canyon under the text and the sky behind it: the horizon follows the foot of the
  // text column. A lower horizon flattens the ground, and a closer view evens that out.
  const horizon = Math.max(0.12, column[1] - 0.02);
  const under = {
    horizon,
    sun: 0.3,
    zoom: Math.min(2.2, 0.5 / horizon),
  };
  const calm = { box: column, grow: -24, fade: 100 };
  // Under the text the sky is most of the picture: it dims toward the top and returns
  // slowly beside the text, so the calm box leaves no outline in it.
  const sky = { calm: { ...calm, fade: 240 }, fadeTop: 0.7 };
  return (
    <div ref={root} className="absolute inset-0">
      {dusk ? (
        <CanyonRiver
          className="absolute inset-0"
          dusk={1}
          fps={12}
          frame={under}
          {...sky}
          fallback={ground(78, "#16254f", "#7a4a5c")}
        />
      ) : roomy ? (
        // The horizon and the sun stand above the greeting, the sunlit wall beside the
        // text, and the river runs out under the chips.
        <CanyonRiver
          key="beside"
          className="absolute inset-0"
          fps={12}
          frame={{ horizon: 0.8 }}
          calm={calm}
          fallback={ground(20, "#2c5590", "#e8a25a")}
        />
      ) : (
        <CanyonRiver
          key="under"
          className="absolute inset-0"
          fps={12}
          frame={under}
          {...sky}
          fallback={ground(78, "#2c5590", "#e8a25a")}
        />
      )}
    </div>
  );
}

export const CanyonRiverGround = () => <Canyon dusk={false} />;
export const CanyonDuskGround = () => <Canyon dusk />;
