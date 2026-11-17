import { Elapsed } from "@/components/run/elapsed";
import type { BudgetUsage } from "@/lib/research/run-view";
import { formatDuration } from "@/lib/ui/format";
import type { RunTotals } from "@/lib/ui/totals";
import { cn } from "@/lib/utils";

function Meter({
  label,
  name = label,
  value,
  max,
}: {
  label: string;
  // The accessible name, when the visible label leans on a heading next to it.
  name?: string;
  value: number;
  max: number;
}) {
  const used = Math.min(value, max);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {used}
          <span className="text-muted-foreground"> / {max}</span>
        </span>
      </div>
      {/* The native meter carries the value for assistive technology; the segments draw it. */}
      <meter
        aria-label={name}
        min={0}
        max={max}
        value={used}
        className="sr-only"
      >
        {used} of {max}
      </meter>
      <div aria-hidden className="flex gap-0.5">
        {Array.from({ length: max }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the segments are positional and never reorder
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-200",
              i < used ? "bg-link" : "bg-muted ring-1 ring-border ring-inset",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Total({ label, children }: { label: string; children: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label} </span>
      <span className="font-mono tabular-nums">{children}</span>
    </span>
  );
}

/**
 * How much of the fixed budget the run has used (U4, B1 to B3). The searches and the
 * pages count for the current round, or for the last round of a run that has ended.
 * The last line counts the whole run, failures included (F1, F3).
 */
export function BudgetCard({
  budget,
  totals,
  running,
  startedAt,
  totalMs,
}: {
  budget: BudgetUsage;
  totals: RunTotals;
  running: boolean;
  startedAt: string | null;
  totalMs: number | null;
}) {
  const { limits } = budget;
  return (
    <section
      aria-label="Budget"
      className="flex flex-col gap-3 rounded-xl border bg-card px-3 py-3"
    >
      <div className="flex items-baseline justify-between text-xs">
        <h2 className="font-medium">Budget</h2>
        <span className="font-mono tabular-nums text-muted-foreground">
          {running ? (
            <Elapsed since={startedAt} />
          ) : totalMs === null ? null : (
            formatDuration(totalMs)
          )}
        </span>
      </div>
      {limits === null ? (
        <p className="text-xs text-muted-foreground">
          The run has not started yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Meter label="Round" value={budget.rounds} max={limits.rounds} />
          <Meter label="Site map" value={budget.maps} max={limits.mapsPerRun} />
          <p className="col-span-2 -mb-1 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
            This round
          </p>
          <Meter
            label="Searches"
            name="Searches this round"
            value={budget.queriesThisRound}
            max={limits.queriesPerRound}
          />
          <Meter
            label="Pages read"
            name="Pages read this round"
            value={budget.readsThisRound}
            max={limits.readsPerRound}
          />
        </div>
      )}
      <p className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2.5 text-xs">
        <span className="font-medium">Whole run</span>
        <Total label="Searches">{totals.searches}</Total>
        <Total label="Pages read">{totals.pagesRead}</Total>
        {totals.pagesFailed > 0 && (
          <Total label="failed">{totals.pagesFailed}</Total>
        )}
        {totals.pagesSkipped > 0 && (
          <Total label="skipped">{totals.pagesSkipped}</Total>
        )}
        <Total label="Claims verified">{totals.claimsVerified}</Total>
        <Total label="dropped">{totals.claimsDropped}</Total>
      </p>
    </section>
  );
}
