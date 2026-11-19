import { cn } from "@/lib/utils";

const PITCH = 6;
const RADII = Array.from({ length: 44 }, (_, i) => 2 * (1 - i / 44) ** 1.5);

/**
 * One row of halftone dots that shrink to nothing on the right, the way the bridge deck
 * of the start screen fades into the dusk.
 */
export function HalftoneRule({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={RADII.length * PITCH}
      height={PITCH}
      viewBox={`0 0 ${RADII.length * PITCH} ${PITCH}`}
      className={cn("block h-auto max-w-full fill-primary", className)}
    >
      {RADII.map((r, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: the dots are positional and never reorder
          key={i}
          cx={i * PITCH + PITCH / 2}
          cy={PITCH / 2}
          r={r}
        />
      ))}
    </svg>
  );
}

const DOT = 2;

/**
 * A line of fine dots as wide as its box, in the current text colour. Each dot is a
 * dash of no length with a round cap, so the line needs no pattern and no id.
 */
export function DotLine({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      height={DOT}
      className={cn("block w-full overflow-visible", className)}
    >
      <line
        x1={DOT / 2}
        x2="100%"
        y1={DOT / 2}
        y2={DOT / 2}
        stroke="currentColor"
        strokeWidth={DOT}
        strokeLinecap="round"
        strokeDasharray={`0 ${PITCH}`}
      />
    </svg>
  );
}
