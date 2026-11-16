"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/ascii/motion";
import { cn } from "@/lib/utils";

const W = 34;
const H = 17;
const CELL = 3;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const QUESTION = [
  ".###.",
  "#...#",
  "....#",
  "...#.",
  "..#..",
  ".....",
  "..#..",
];
const BANG = ["#", "#", "#", "#", "#", ".", "#"];
const CROSS = [
  "#.....#",
  ".#...#.",
  "..#.#..",
  "...#...",
  "..#.#..",
  ".#...#.",
  "#.....#",
];
const FOUR = ["#.#", "#.#", "###", "..#", "..#"];
const ZERO = ["###", "#.#", "#.#", "#.#", "###"];

function stamp(cells: Set<number>, rows: string[], ox: number, oy: number) {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== "#") return;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          cells.add((oy + y * 2 + dy) * W + ox + x * 2 + dx);
        }
      }
    });
  });
  return cells;
}

const INK = {
  failed: stamp(stamp(new Set(), QUESTION, 10, 1), BANG, 22, 1),
  cancelled: stamp(new Set(), CROSS, 10, 1),
  "not-found": stamp(
    stamp(stamp(new Set(), FOUR, 6, 3), ZERO, 14, 3),
    FOUR,
    22,
    3,
  ),
} as const;

export type DitherVariant = keyof typeof INK;

function hash(x: number, y: number, seed: number) {
  let h =
    (Math.imul(x, 374761393) +
      Math.imul(y, 668265263) +
      Math.imul(seed, 1442695041)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function nearInk(ink: ReadonlySet<number>, x: number, y: number) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && ink.has(ny * W + nx)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * A pixel glyph in a cloud of dithered dots, for a run that failed, was cancelled, or
 * does not exist. The cloud shimmers slowly and holds still under reduced motion.
 */
export function DitherGlyph({
  variant,
  className,
}: {
  variant: DitherVariant;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1400);
    return () => clearInterval(timer);
  }, [reduce]);

  const cells = useMemo(() => {
    const ink = INK[variant];
    const out: {
      x: number;
      y: number;
      kind: "ink" | "dot" | "off";
      delay: number;
    }[] = [];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const dx = (x - (W - 1) / 2) / (W / 2);
        const dy = (y - (H - 1) / 2) / (H / 2);
        const glow = Math.max(0, 1 - Math.hypot(dx, dy)) * 1.15;
        const noise = (hash(x, y, tick) - 0.5) * 0.14;
        const threshold = ((BAYER[y % 4]?.[x % 4] ?? 0) + 0.5) / 16;
        let kind: "ink" | "dot" | "off" = "off";
        if (ink.has(y * W + x)) kind = "ink";
        else if (!nearInk(ink, x, y) && threshold < glow + noise) kind = "dot";
        out.push({ x, y, kind, delay: Math.round(hash(x, y, 7) * 260) });
      }
    }
    return out;
  }, [variant, tick]);

  return (
    <svg
      aria-hidden="true"
      className={cn("h-auto w-36 overflow-visible", className)}
      viewBox={`0 0 ${W * CELL} ${H * CELL}`}
    >
      {cells.map((cell) => {
        const ink = cell.kind === "ink";
        return (
          <rect
            key={`${cell.x}-${cell.y}`}
            className={cn(
              "transition-opacity duration-300 ease-out motion-reduce:transition-none",
              ink ? "fill-foreground" : "fill-muted-foreground",
            )}
            x={cell.x * CELL + (ink ? 0 : 0.5)}
            y={cell.y * CELL + (ink ? 0 : 0.5)}
            width={ink ? CELL + 0.02 : CELL - 1}
            height={ink ? CELL + 0.02 : CELL - 1}
            shapeRendering="crispEdges"
            style={{
              opacity: cell.kind === "off" ? 0 : ink ? 1 : 0.5,
              transitionDelay: `${cell.delay}ms`,
            }}
          />
        );
      })}
    </svg>
  );
}
