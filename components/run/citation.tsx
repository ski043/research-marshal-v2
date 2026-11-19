"use client";

import { ArrowUpRightIcon } from "lucide-react";
import { useId } from "react";
import { SourceLabelBadge } from "@/components/run/source-label";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { VerifiedClaim } from "@/lib/research/run-view";

/**
 * A citation of the report: a numbered chip. Hover or keyboard focus shows the quote,
 * the source title, the domain and the label (U6). A click opens the source page in a
 * new tab (U7).
 */
export function Citation({ claim }: { claim: VerifiedClaim }) {
  const quoteId = useId();
  const { source } = claim;
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={120}
        closeDelay={120}
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Citation ${claim.number}: ${source.title}, ${source.domain}, ${source.label}. Opens in a new tab.`}
        aria-describedby={quoteId}
        className="relative mx-px inline-flex h-4.5 min-w-4.5 -translate-y-px items-center justify-center rounded-md bg-primary-soft px-1 align-middle font-mono text-[0.6875rem] font-medium leading-none text-primary-ink no-underline tabular-nums transition-colors duration-150 before:absolute before:-inset-1 hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-popup-open:bg-primary data-popup-open:text-primary-foreground"
      >
        {claim.number}
      </HoverCardTrigger>
      <span id={quoteId} hidden>
        Quote: {claim.quote}
      </span>
      <HoverCardContent
        side="top"
        align="center"
        sideOffset={6}
        className="w-80 max-w-[calc(100vw-2rem)] rounded-xl p-0"
      >
        <figure className="flex flex-col">
          <blockquote className="border-b px-3.5 py-3 text-sm/relaxed text-pretty text-popover-foreground">
            <span aria-hidden className="text-muted-foreground">
              “
            </span>
            {claim.quote}
            <span aria-hidden className="text-muted-foreground">
              ”
            </span>
          </blockquote>
          <figcaption className="flex flex-col gap-1.5 px-3.5 py-2.5">
            <span className="flex items-start gap-1 text-sm font-medium text-popover-foreground">
              <span className="line-clamp-2 min-w-0">{source.title}</span>
              <ArrowUpRightIcon
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
            </span>
            <span className="flex items-center gap-2">
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {source.domain}
              </span>
              <SourceLabelBadge label={source.label} />
            </span>
          </figcaption>
        </figure>
      </HoverCardContent>
    </HoverCard>
  );
}
