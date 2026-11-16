import { ArrowUpRightIcon } from "lucide-react";
import { SourceLabelBadge } from "@/components/run/source-label";
import type { ClaimNumber } from "@/lib/research/events";
import type { Source } from "@/lib/research/run-view";

/** The live source list (S3): every page that a verified claim cites. */
export function SourcesList({
  sources,
  running,
}: {
  sources: readonly { source: Source; claims: readonly ClaimNumber[] }[];
  running: boolean;
}) {
  if (sources.length === 0) {
    return (
      <p className="px-2 py-6 text-sm text-pretty text-muted-foreground">
        {running
          ? "No source yet. A page becomes a source when one of its claims is verified."
          : "This run has no source: no claim was verified."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {sources.map(({ source, claims }, i) => (
        <li
          key={source.url}
          className="flex animate-in items-start gap-3 rounded-lg px-2 py-2 duration-200 fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
        >
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs tabular-nums text-muted-foreground"
          >
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-1 rounded-sm text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="line-clamp-2 min-w-0 underline-offset-3 group-hover:underline">
                {source.title}
              </span>
              <ArrowUpRightIcon
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {source.domain}
              </span>
              <SourceLabelBadge label={source.label} />
              <span className="text-xs text-muted-foreground">
                {claims.length === 1 ? "Claim" : "Claims"}{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {claims.join(", ")}
                </span>
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
