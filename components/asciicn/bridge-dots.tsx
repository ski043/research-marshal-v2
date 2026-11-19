import { cn } from "@/lib/utils";

const BRIDGE = [
  ".......o........................o.......",
  "......###......................###......",
  ".....#.#.##..................##.#.#.....",
  "....#..#...##..............##...#..#....",
  "..##...#.....###........###.....#...##..",
  ".#.....#........########........#.....#.",
  "########################################",
  ".......#........................#.......",
] as const;
const COLUMNS = BRIDGE[0].length;
const PITCH = 6;
const DOT = 3;
// "#" is steel and "o" a lamp on a tower top.
const DOTS = BRIDGE.flatMap((row, y) =>
  [...row].flatMap((cell, x) =>
    cell === "." ? [] : [{ x, y, lamp: cell === "o" }],
  ),
);

/**
 * The bridge of the start screen as a dot matrix. `progress` from 0 to 1 lights it from
 * the left, column by column.
 */
export function BridgeDots({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const lit = Math.round(progress * COLUMNS);
  return (
    <svg
      aria-hidden="true"
      width={COLUMNS * PITCH}
      height={BRIDGE.length * PITCH}
      viewBox={`0 0 ${COLUMNS * PITCH} ${BRIDGE.length * PITCH}`}
      className={cn("block h-auto max-w-full", className)}
    >
      {DOTS.map(({ x, y, lamp }) => (
        <circle
          key={`${x}-${y}`}
          // A dot of 3px sits on whole pixels, so it stays sharp at 1x.
          cx={x * PITCH + 1 + DOT / 2}
          cy={y * PITCH + 1 + DOT / 2}
          r={DOT / 2}
          className={cn(
            "transition-[fill] duration-400 ease-out motion-reduce:transition-none",
            x >= lit
              ? "fill-muted-foreground/30"
              : lamp
                ? "fill-highlight"
                : "fill-primary",
          )}
        />
      ))}
    </svg>
  );
}
