"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

export const START_VARIANTS = [
  "san-francisco",
  "lighthouse",
  "globe",
  "ribbons",
  "star-chart",
] as const;
export type StartVariant = (typeof START_VARIANTS)[number];

export const DEFAULT_START_VARIANT: StartVariant = "san-francisco";

export function isStartVariant(value: unknown): value is StartVariant {
  return START_VARIANTS.some((variant) => variant === value);
}

type Spec = {
  label: string;
  name: string;
  /** Whether the small globe stays above the greeting. */
  mark: boolean;
  /** Classes for the screen. `dark` gives a scene that paints its own night the dark tokens in both themes. */
  screen?: string;
  /** Classes for the block of the mark and the greeting. */
  hero?: string;
  Ground: ComponentType;
};

// Every ground is its own chunk that loads after the prompt box, so the WebGL engine
// stays out of the first load of the start screen.
const SPECS: Record<StartVariant, Spec> = {
  "san-francisco": {
    label: "B1",
    name: "San Francisco",
    mark: false,
    screen: "dark",
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/san-francisco").then(
          (mod) => mod.SanFranciscoGround,
        ),
      { ssr: false },
    ),
  },
  lighthouse: {
    label: "B2",
    name: "Lighthouse",
    mark: false,
    // The greeting sits on the picture, which is night in both themes.
    hero: "dark text-foreground",
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/lighthouse").then(
          (mod) => mod.LighthouseGround,
        ),
      { ssr: false },
    ),
  },
  globe: {
    label: "B3",
    name: "Globe",
    mark: false,
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/globe").then(
          (mod) => mod.GlobeGround,
        ),
      { ssr: false },
    ),
  },
  ribbons: {
    label: "B4",
    name: "Ribbons",
    mark: true,
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/ribbons").then(
          (mod) => mod.RibbonsGround,
        ),
      { ssr: false },
    ),
  },
  "star-chart": {
    label: "B5",
    name: "Star chart",
    mark: false,
    Ground: dynamic(
      () =>
        import("@/components/asciicn/start/star-chart").then(
          (mod) => mod.StarChartGround,
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
