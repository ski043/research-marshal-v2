"use client";

import { type ComponentProps, useMemo } from "react";
import { Streamdown } from "streamdown";
import { HalftoneRule } from "@/components/asciicn/dot-rule";
import { Citation } from "@/components/run/citation";
import type { ReportView, VerifiedClaim } from "@/lib/research/run-view";
import { citationOf, linkCitations } from "@/lib/ui/citations";
import { cn } from "@/lib/utils";

type Components = NonNullable<ComponentProps<typeof Streamdown>["components"]>;

// Only the first heading of a report carries the rule.
const FIRST_HEADING = "mt-2.5 [:is(h1,h2)~*>&]:hidden";

// Streamdown passes the syntax node along; it must not reach the DOM.
const TYPOGRAPHY = {
  h1: ({ node: _node, children, ...props }) => (
    <h1
      {...props}
      className="mt-0 mb-4 text-2xl font-semibold tracking-tight text-balance"
    >
      {children}
      <HalftoneRule className={FIRST_HEADING} />
    </h1>
  ),
  h2: ({ node: _node, children, ...props }) => (
    <h2
      {...props}
      className="mt-8 mb-3 text-lg font-semibold tracking-tight text-balance"
    >
      {children}
      <HalftoneRule className={FIRST_HEADING} />
    </h2>
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 {...props} className="mt-6 mb-2 text-base font-semibold" />
  ),
  p: ({ node: _node, ...props }) => (
    <p {...props} className="my-3 text-pretty" />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul {...props} className="my-3 flex list-disc flex-col gap-1.5 ps-5" />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol {...props} className="my-3 flex list-decimal flex-col gap-1.5 ps-5" />
  ),
  li: ({ node: _node, ...props }) => (
    <li {...props} className="ps-1 text-pretty marker:text-muted-foreground" />
  ),
  strong: ({ node: _node, ...props }) => (
    <strong {...props} className="font-semibold" />
  ),
  // A report holds no image: the run already reduces one to its alt text. This keeps a
  // browser from ever loading a remote image that web text talked the model into.
  img: ({ alt }) => <>{alt}</>,
} satisfies Components;

/**
 * The report (R1), rendered as Markdown. Each citation mark of a verified claim becomes
 * a chip with a popover. While the model writes, the text streams in; a finished report
 * is static.
 */
export function Report({
  report,
  verified,
  className,
}: {
  report: ReportView;
  verified: readonly VerifiedClaim[];
  className?: string;
}) {
  const claims = useMemo(
    () => new Map(verified.map((claim) => [claim.number as number, claim])),
    [verified],
  );
  const markdown = useMemo(
    () => linkCitations(report.markdown, new Set(claims.keys())),
    [report.markdown, claims],
  );
  const components = useMemo<Components>(
    () => ({
      ...TYPOGRAPHY,
      a: ({ node: _node, href, children, ...props }) => {
        const claim = claims.get(citationOf(href) ?? -1);
        if (claim) return <Citation claim={claim} />;
        return (
          <a
            {...props}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm font-medium text-link underline decoration-link/40 underline-offset-3 transition-colors duration-150 hover:text-primary-ink hover:decoration-primary-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {children}
          </a>
        );
      },
    }),
    [claims],
  );
  const final = report.kind === "final";

  return (
    <article
      aria-label="Report"
      aria-busy={!final}
      className={cn("text-[0.9375rem]/7 text-foreground", className)}
    >
      <Streamdown
        mode={final ? "static" : "streaming"}
        isAnimating={!final}
        linkSafety={{ enabled: false }}
        components={components}
        className="space-y-0"
      >
        {markdown}
      </Streamdown>
    </article>
  );
}
