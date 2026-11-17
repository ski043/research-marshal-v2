"use client";

import { useMemo, useRef } from "react";
import { useStartBoxes } from "@/components/asciicn/start/use-boxes";
import { luma, useAsciiColors } from "@/lib/ascii";
import {
  SEED_GLSL,
  type SeedOptions,
  seedParams,
  seedUniforms,
} from "@/lib/ascii/seed";
import { AsciiShader } from "@/lib/ascii/shader";
import { cn } from "@/lib/utils";

// Violet that turns to the blue of the app, in two rolls of the seeded ribbon field.
const OPTIONS = {
  hue: [250, 275],
  turn: [40, 90],
  vividness: 1.1,
  // Wide, nearly level ribbons, so each band reads as one stream across the screen.
  ribbons: {
    amplitude: [0.08, 0.1],
    angle: [-0.1, 0.1],
    count: [4, 5],
    fold: [0.25, 0.4],
    frequency: [0.7, 0.8],
    glow: [0.8, 0.9],
    spread: [0.6, 0.7],
    width: [0.068, 0.075],
  },
} as const satisfies SeedOptions;
const BANDS = {
  top: { params: seedParams("marshal", "ribbons", OPTIONS), inner: 0 },
  bottom: { params: seedParams("sources", "ribbons", OPTIONS), inner: 1 },
} as const;

// A band is strongest at the edge of the screen and gone at its inner edge
// (ribbonsInner is that edge in uv.y). It also thins out to nothing where text sits
// and returns over ribbonsCalm.z cells.
const FIELD = `${SEED_GLSL.ribbons.field.replace("float field(", "float ribbonsTone(")}
float field(vec2 uv, vec2 res, float t) {
  vec2 away = (abs(uv - ribbonsCalmBox.xy - ribbonsCalmBox.zw * 0.5) - ribbonsCalmBox.zw * 0.5) * ascii_samples;
  float d = length(max(away - ribbonsCalm.y, 0.0));
  float clear = 1.0 - ribbonsCalm.x * (1.0 - smoothstep(0.0, max(ribbonsCalm.z, 1.0), d));
  float edge = smoothstep(0.0, 0.6, abs(uv.y - ribbonsInner));
  return ribbonsTone(uv, res, t) * clear * edge;
}
`;

const PAPER = ["--ascii-paper"] as const;
const CELL = 8;

function Band({
  side,
  className,
}: {
  side: keyof typeof BANDS;
  className: string;
}) {
  const { params, inner } = BANDS[side];
  const canvas = useRef<HTMLDivElement>(null);
  const { column } = useStartBoxes(canvas);
  const paper = useAsciiColors(canvas, PAPER)?.[0];
  const onLight = paper
    ? luma(paper[0] * 255, paper[1] * 255, paper[2] * 255) > 0.5
    : false;
  const seed = useMemo(
    () => seedUniforms(params, { onLight }),
    [params, onLight],
  );
  return (
    <AsciiShader
      ref={canvas}
      className={cn("absolute inset-x-0", className)}
      field={FIELD}
      colorField={SEED_GLSL.ribbons.colorField}
      uniforms={{
        ...seed,
        ribbonsCalm: [column[2] > 0 ? 1 : 0, -8 / CELL, 170 / CELL],
        ribbonsCalmBox: [...column],
        ribbonsInner: inner,
      }}
      charset="dots"
      colorMode="truecolor"
      background="transparent"
      square
      cell={CELL}
      dither="bayer4"
      stillTime={8}
    />
  );
}

export function RibbonsGround() {
  return (
    <>
      <Band side="top" className="top-0 h-[40%]" />
      <Band side="bottom" className="bottom-0 h-[40%]" />
    </>
  );
}
