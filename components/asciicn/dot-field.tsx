"use client";

import { useRef } from "react";
import { resolveCharset } from "@/lib/ascii/charsets";
import { useAsciiColors } from "@/lib/ascii/color";
import { AsciiGrid, type AsciiGridDrawContext } from "@/lib/ascii/grid";
import { cn } from "@/lib/utils";

const DOTS = resolveCharset("dots").glyphs;
const INKS = ["--ascii-color-blue", "--ascii-ink", "--ascii-color-purple"];

function hash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * sx;
  const bottom =
    hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * A slow field of halftone dots for the ground behind the start screen. The field is
 * clear behind a centred box of `clear` CSS pixels, so the text there sits on plain
 * ground, and it is strongest toward the corners.
 */
export function DotField({
  clear,
  className,
}: {
  clear: { width: number; height: number };
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const inks = useAsciiColors(root, INKS);

  const draw = ({
    frame,
    columns,
    rows,
    time,
    metrics,
  }: AsciiGridDrawContext) => {
    const { glyphs, colors } = frame;
    if (!inks || !colors) return;
    const halfW = clear.width / 2 / metrics.width;
    const halfH = clear.height / 2 / metrics.height;
    const cx = columns / 2;
    const cy = rows / 2;
    const reach = Math.hypot(cx, cy);
    const drift = time * 0.05;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const dx = Math.max(0, Math.abs(column + 0.5 - cx) - halfW);
        const dy = Math.max(0, Math.abs(row + 0.5 - cy) - halfH);
        const cleared = smooth(0, 9, Math.hypot(dx, dy));
        if (cleared === 0) continue;
        const edge =
          smooth(0, 3, Math.min(column, columns - 1 - column)) *
          smooth(0, 3, Math.min(row, rows - 1 - row));
        const corner =
          0.3 + 0.7 * (Math.hypot(column - cx, row - cy) / reach) ** 2;
        const shape =
          noise(column * 0.07 + drift, row * 0.07 - drift * 0.6) * 0.7 +
          noise(column * 0.19 - drift * 1.3, row * 0.19 + 4.2) * 0.3;
        const tone = smooth(0.46, 0.8, shape) * cleared * edge * corner;
        const level = Math.round(tone * (DOTS.length - 1));
        if (level === 0) continue;
        const index = row * columns + column;
        glyphs[index] = DOTS[level] ?? " ";
        const hue = noise(column * 0.035 + 9.1, row * 0.035 + drift * 0.5);
        const [a, b] = hue < 0.55 ? [inks[0], inks[1]] : [inks[1], inks[2]];
        const mix = hue < 0.55 ? hue / 0.55 : (hue - 0.55) / 0.45;
        const at = index * 4;
        colors[at] = (a[0] + (b[0] - a[0]) * mix) * 255;
        colors[at + 1] = (a[1] + (b[1] - a[1]) * mix) * 255;
        colors[at + 2] = (a[2] + (b[2] - a[2]) * mix) * 255;
        colors[at + 3] = 255 * (0.35 + 0.65 * tone);
      }
    }
  };

  return (
    <AsciiGrid
      ref={root}
      draw={draw}
      square
      colored
      cell={13}
      fps={12}
      stillTime={40}
      className={cn("absolute inset-0", className)}
    />
  );
}
