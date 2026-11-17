"use client";

import { useRef } from "react";
import {
  AsciiGlobe,
  type GlobeArc,
  type GlobeFrame,
  type GlobeMarker,
  type LatLon,
} from "@/components/asciicn/ascii-globe";
import { useRoomy } from "@/components/asciicn/start/use-wide";

const PLACES = {
  sanFrancisco: [37.8, -122.4],
  newYork: [40.7, -74],
  saoPaulo: [-23.5, -46.6],
  london: [51.5, -0.1],
  berlin: [52.5, 13.4],
  cairo: [30, 31.2],
  nairobi: [-1.3, 36.8],
  mumbai: [19.1, 72.9],
  singapore: [1.4, 103.8],
  tokyo: [35.7, 139.7],
  sydney: [-33.9, 151.2],
  reykjavik: [64.1, -21.9],
} as const satisfies Record<string, LatLon>;

const MARKERS: readonly GlobeMarker[] = Object.values(PLACES).map((at) => ({
  at,
}));

const ARCS: readonly GlobeArc[] = [
  { from: PLACES.sanFrancisco, to: PLACES.newYork },
  { from: PLACES.newYork, to: PLACES.london },
  { from: PLACES.london, to: PLACES.berlin },
  { from: PLACES.berlin, to: PLACES.mumbai },
  { from: PLACES.mumbai, to: PLACES.tokyo },
  { from: PLACES.tokyo, to: PLACES.sanFrancisco },
  { from: PLACES.london, to: PLACES.cairo },
  { from: PLACES.reykjavik, to: PLACES.newYork },
];

// The text column is 42rem wide. Beside it a large globe shows one sunlit limb at the
// right edge; the limb stops short of the text.
const beside = (width: number, height: number): GlobeFrame => {
  const flank = (width - 672) / 2;
  const radius = flank * 1.6;
  return { cx: width + radius - flank + 20, cy: height * 0.54, radius };
};
// Without room beside the text the globe rises from the bottom edge, under the chips.
const below = (width: number, height: number): GlobeFrame => ({
  cx: width / 2,
  cy: height * 0.6 + width * 0.95,
  radius: width * 0.95,
});

export function GlobeGround() {
  const ground = useRef<HTMLDivElement>(null);
  const wide = useRoomy(ground);
  return (
    <div ref={ground} className="absolute inset-0">
      <AsciiGlobe
        draggable={false}
        className="absolute inset-0"
        charset="dots"
        square
        cell={7}
        grade={{ brightness: -0.07 }}
        fps={15}
        speed={2}
        tilt={wide ? 12 : -14}
        light={wide ? 300 : 285}
        ocean={0.5}
        dither="bayer4"
        glint={false}
        color="blue"
        oceanColor="--primary"
        accent="orange"
        markers={MARKERS}
        arcs={ARCS}
        frame={wide ? beside : below}
      />
    </div>
  );
}
