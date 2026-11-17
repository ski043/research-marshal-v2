"use client";

import {
  AsciiGlobe,
  type GlobeArc,
  type GlobeMarker,
  type LatLon,
} from "@/components/asciicn/ascii-globe";
import { useWide } from "@/components/asciicn/start/use-wide";

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

export function GlobeGround() {
  const wide = useWide();
  return (
    <AsciiGlobe
      draggable={false}
      className="absolute inset-x-0 bottom-0 h-[44%]"
      charset="dots"
      square
      cell={7}
      grade={{ brightness: -0.07 }}
      fps={15}
      speed={2}
      tilt={-14}
      light={285}
      ocean={0.36}
      dither="bayer4"
      color="--primary-ink"
      oceanColor="--primary"
      accent="orange"
      markers={MARKERS}
      arcs={ARCS}
      frame={{ radius: wide ? 0.56 : 0.95, top: 44 }}
    />
  );
}
