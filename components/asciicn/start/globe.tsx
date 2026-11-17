"use client";

import { useRef } from "react";
import {
  AsciiGlobe,
  type AsciiGlobeProps,
  type GlobeArc,
  type GlobeFrame,
  type GlobeMarker,
  type LatLon,
} from "@/components/asciicn/ascii-globe";
import { useStartBoxes } from "@/components/asciicn/start/use-boxes";
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

/** The edges of the text column inside the ground, in CSS pixels from the top left. */
type Text = { left: number; right: number; top: number; bottom: number };

type Look = Pick<
  AsciiGlobeProps,
  | "tilt"
  | "light"
  | "lightDepth"
  | "start"
  | "speed"
  | "halo"
  | "ocean"
  | "color"
  | "oceanColor"
  | "grade"
  | "graticule"
>;

type Composition = {
  /** Where the globe sits with room beside the text column. */
  beside: (width: number, height: number, text: Text) => GlobeFrame;
  /** Where it sits on a narrow screen, where the text fills the width. */
  narrow: (width: number, height: number, text: Text) => GlobeFrame;
  look: Look;
  narrowLook?: Look;
};

export type GlobePosition =
  | "right"
  | "bottom"
  | "left"
  | "top"
  | "center"
  | "corner";

// A horizon from orbit: a globe wider than the screen, its crown just under the text.
const horizon = (width: number, _height: number, text: Text): GlobeFrame => {
  const radius = Math.max(width * 0.8, 480);
  return { cx: width / 2, cy: text.bottom - 20 + radius, radius };
};
// A limb in a lower corner, clear of the text column above it.
const corner =
  (side: 1 | -1) =>
  (width: number, height: number): GlobeFrame => {
    const radius = Math.max(width * 0.45, 330);
    return {
      cx: width / 2 + side * (width / 2 + radius * 0.3),
      cy: height + radius * 0.3,
      radius,
    };
  };

const COMPOSITIONS: Record<GlobePosition, Composition> = {
  // One sunlit limb at the right edge, lit from the side of the text.
  right: {
    beside: (width, height, text) => {
      const radius = (width - text.right) * 1.6;
      return { cx: text.right + 20 + radius, cy: height * 0.54, radius };
    },
    narrow: corner(1),
    look: { tilt: 12, light: 300, speed: 2, ocean: 0.5 },
  },
  bottom: {
    beside: horizon,
    narrow: horizon,
    // The pole leans away, so the crown shows the latitudes where the cities are.
    // The sun stands behind the planet: a lit crescent on the horizon and night under it.
    look: {
      tilt: -52,
      light: 12,
      lightDepth: -0.55,
      speed: 1.2,
      ocean: 0.65,
      halo: 0.025,
    },
  },
  left: {
    beside: (_width, height, text) => {
      const radius = text.left * 1.6;
      return { cx: text.left - 20 - radius, cy: height * 0.46, radius };
    },
    narrow: corner(-1),
    look: { tilt: 16, light: 60, start: 100, speed: 2, ocean: 0.5 },
  },
  // A cap hanging from the top edge, lit from below, over the greeting.
  top: {
    beside: (width, _height, text) => {
      const radius = width * 0.75;
      return { cx: width / 2, cy: text.top - 14 - radius, radius };
    },
    narrow: (width, _height, text) => {
      const radius = Math.max(width * 0.9, 380);
      return { cx: width / 2, cy: text.top - 4 - radius, radius };
    },
    look: {
      tilt: -140,
      light: 195,
      lightDepth: -0.6,
      start: 60,
      speed: 1.6,
      ocean: 0.65,
      halo: 0.03,
    },
  },
  // The whole globe behind the text, which the calm box clears.
  center: {
    beside: (width, height, text) => ({
      cx: (text.left + text.right) / 2,
      cy: (text.top + text.bottom) / 2,
      radius: Math.min(width, height) * 0.47,
    }),
    // The text fills the width, so the globe is taller than the text: one cap shows
    // above the greeting and one below the note.
    narrow: (width, _height, text) => ({
      cx: width / 2,
      cy: (text.top + text.bottom) / 2,
      radius: (text.bottom - text.top) / 2 + 150,
    }),
    // The pole leans to the viewer, so the upper cap shows the north of the continents.
    narrowLook: { tilt: 50 },
    // The sun stands behind the viewer, so the whole ring around the text is lit.
    look: {
      tilt: 6,
      light: 315,
      lightDepth: 0.92,
      speed: 2.5,
      ocean: 0.55,
      graticule: true,
      grade: { brightness: -0.2 },
      color: "grey",
      oceanColor: "grey",
    },
  },
  corner: {
    beside: corner(1),
    narrow: corner(1),
    look: {
      tilt: 24,
      light: 315,
      start: -60,
      speed: 2,
      ocean: 0.5,
    },
  },
};

export function GlobeGround({ position }: { position: GlobePosition }) {
  const ground = useRef<HTMLDivElement>(null);
  const roomy = useRoomy(ground);
  const { column } = useStartBoxes(ground);
  const { beside, narrow, look, narrowLook } = COMPOSITIONS[position];
  const place = roomy ? beside : narrow;
  // The column carries 40px of padding above the greeting and below the note.
  const frame = (width: number, height: number) =>
    place(width, height, {
      left: column[0] * width,
      right: (column[0] + column[2]) * width,
      top: (1 - column[1] - column[3]) * height + 40,
      bottom: (1 - column[1]) * height - 40,
    });
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
        dither="bayer4"
        glint={false}
        color="blue"
        oceanColor="--primary"
        accent="orange"
        markers={MARKERS}
        arcs={ARCS}
        frame={frame}
        calm={{ box: column, grow: -28, fade: 56 }}
        {...look}
        {...(roomy ? undefined : narrowLook)}
      />
    </div>
  );
}

export const GlobeRightGround = () => <GlobeGround position="right" />;
export const GlobeBottomGround = () => <GlobeGround position="bottom" />;
export const GlobeLeftGround = () => <GlobeGround position="left" />;
export const GlobeTopGround = () => <GlobeGround position="top" />;
export const GlobeCenterGround = () => <GlobeGround position="center" />;
export const GlobeCornerGround = () => <GlobeGround position="corner" />;
