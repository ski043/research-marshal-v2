"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

export const START_VARIANTS = [
  "san-francisco",
  "canyon-river",
  "canyon-dusk",
  "globe-right",
  "globe-bottom",
  "globe-left",
  "globe-top",
  "globe-center",
  "globe-corner",
] as const;
export type StartVariant = (typeof START_VARIANTS)[number];

export const DEFAULT_START_VARIANT: StartVariant = "san-francisco";

export function isStartVariant(value: unknown): value is StartVariant {
  return START_VARIANTS.some((variant) => variant === value);
}

type Spec = {
  name: string;
  /** Variants of one picture share a group, and `name` tells them apart inside it. */
  group?: string;
  /** Classes for the screen. `dark` gives a scene that paints its own night the dark tokens in both themes. */
  screen?: string;
  Ground: ComponentType;
};

// The deep blue of the canyon from the first paint, before the scene has loaded.
const CANYON_SCREEN = "dark bg-[#070c1a]";

// Every ground is its own chunk that loads after the prompt box, so the WebGL engine
// stays out of the first load of the start screen.
const SPECS: Record<StartVariant, Spec> = {
  "san-francisco": {
    name: "San Francisco",
    // The dusk of the scene from the first paint, before the scene has loaded.
    screen: "dark bg-[#05081a]",
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/san-francisco").then(
          (mod) => mod.SanFranciscoGround,
        ),
      { ssr: false },
    ),
  },
  "canyon-river": {
    name: "Golden hour",
    group: "Canyon",
    screen: CANYON_SCREEN,
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/canyon-river").then(
          (mod) => mod.CanyonRiverGround,
        ),
      { ssr: false },
    ),
  },
  "canyon-dusk": {
    name: "Dusk",
    group: "Canyon",
    screen: CANYON_SCREEN,
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/canyon-river").then(
          (mod) => mod.CanyonDuskGround,
        ),
      { ssr: false },
    ),
  },
  "globe-right": {
    name: "Right",
    group: "Globe",
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/globe").then(
          (mod) => mod.GlobeRightGround,
        ),
      { ssr: false },
    ),
  },
  "globe-bottom": {
    name: "Bottom",
    group: "Globe",
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/globe").then(
          (mod) => mod.GlobeBottomGround,
        ),
      { ssr: false },
    ),
  },
  "globe-left": {
    name: "Left",
    group: "Globe",
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/globe").then(
          (mod) => mod.GlobeLeftGround,
        ),
      { ssr: false },
    ),
  },
  "globe-top": {
    name: "Top",
    group: "Globe",
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/globe").then(
          (mod) => mod.GlobeTopGround,
        ),
      { ssr: false },
    ),
  },
  "globe-center": {
    name: "Centre",
    group: "Globe",
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/globe").then(
          (mod) => mod.GlobeCenterGround,
        ),
      { ssr: false },
    ),
  },
  "globe-corner": {
    name: "Corner",
    group: "Globe",
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/globe").then(
          (mod) => mod.GlobeCornerGround,
        ),
      { ssr: false },
    ),
  },
};

export function startVariantSpec(variant: StartVariant): Omit<Spec, "Ground"> {
  return SPECS[variant];
}

/**
 * The picture behind the start screen. It fills the nearest positioned ancestor, sits
 * under the content and takes no pointer events. Decorative, so it is hidden from
 * assistive technology.
 */
export function StartBackground({ variant }: { variant: StartVariant }) {
  const { Ground } = SPECS[variant];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <Ground />
    </div>
  );
}
