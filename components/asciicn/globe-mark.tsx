"use client";

import { useRef } from "react";
import { createToneField, mapTones, type ToneField } from "@/lib/ascii/frame";
import { AsciiGrid, type AsciiGridDrawContext } from "@/lib/ascii/grid";
import { cn } from "@/lib/utils";

const STEP = Math.PI / 6;
const TILT = (20 * Math.PI) / 180;
const COS_TILT = Math.cos(TILT);
const SIN_TILT = Math.sin(TILT);

const toLine = (angle: number) => {
  const turns = angle / STEP;
  return Math.abs(turns - Math.round(turns)) * STEP;
};

/**
 * A wireframe globe that turns slowly, drawn in Braille dots: the live web that a run
 * reads. Decorative, so the canvas is hidden from assistive technology.
 */
export function GlobeMark({ className }: { className?: string }) {
  const field = useRef<ToneField | null>(null);

  const draw = ({
    frame,
    columns,
    rows,
    time,
    metrics,
  }: AsciiGridDrawContext) => {
    let tones = field.current;
    if (!tones || tones.width !== columns * 2 || tones.height !== rows * 4) {
      tones = createToneField(columns, rows, "braille");
      field.current = tones;
    }
    const { width, height } = tones;
    // One Braille dot is half a cell wide and a quarter of a cell tall.
    const dotW = metrics.width / 2;
    const dotH = metrics.height / 4;
    const radius = Math.min(width * dotW, height * dotH) / 2 - 1;
    const spin = time * 0.35;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const px = ((x + 0.5 - width / 2) * dotW) / radius;
        const py = ((height / 2 - y - 0.5) * dotH) / radius;
        const r2 = px * px + py * py;
        let tone = 0;
        if (r2 <= 1) {
          const pz = Math.sqrt(1 - r2);
          const gy = py * COS_TILT - pz * SIN_TILT;
          const gz = py * SIN_TILT + pz * COS_TILT;
          const lat = Math.asin(Math.max(-1, Math.min(1, gy)));
          const lon = Math.atan2(px, gz) + spin;
          const thin = 0.62 / radius;
          const onParallel = toLine(lat) < thin * dotH;
          const onMeridian = toLine(lon) * Math.cos(lat) < thin * dotW;
          const onLimb = 1 - Math.sqrt(r2) < 1.1 / radius;
          tone = onParallel || onMeridian || onLimb ? 1 : 0;
        }
        tones.tones[y * width + x] = tone;
      }
    }
    mapTones(tones, columns, rows, { charset: "braille" }, frame);
  };

  return (
    <AsciiGrid
      draw={draw}
      cell={10}
      fps={20}
      stillTime={2}
      className={cn("relative size-[4.5rem]", className)}
    />
  );
}
