"use client";

import {
  BanIcon,
  ChevronRightIcon,
  FileTextIcon,
  FlagIcon,
  ListChecksIcon,
  ListTreeIcon,
  type LucideIcon,
  NetworkIcon,
  PenLineIcon,
  ScanSearchIcon,
  SearchIcon,
  SkipForwardIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { GlyphSpinner } from "@/components/asciicn/glyph-spinner";
import { DroppedItem, VerifiedItem } from "@/components/run/claims-list";
import { Elapsed } from "@/components/run/elapsed";
import { SourceLabelBadge } from "@/components/run/source-label";
import { domainOf, type WebFailure } from "@/lib/research/events";
import type {
  ActivityGroup,
  ActivityRow,
  ReadRow,
  SkippedPage,
} from "@/lib/ui/activity";
import { formatDuration, plural } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

type Tone = "plain" | "good" | "warn" | "bad";

type RowParts = {
  icon: LucideIcon;
  title: string;
  detail: string;
  status: { text: string; tone: Tone } | null;
  body: ReactNode | null;
};

const TONE: Readonly<Record<Tone, string>> = {
  plain: "text-muted-foreground",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};

const SKIP_REASON: Readonly<Record<SkippedPage["reason"], string>> = {
  "not-chosen": "found, not chosen for reading",
  "over-budget": "over the page budget of the round",
  "already-read": "already read in an earlier round",
  "site-refused": "the web data service refuses this site",
  "run-ended": "the run ended before it was read",
};

const STOPPED_BY = {
  answered: "the verified claims answer the question",
  budget: "the budget ended",
  "dead-end": "no further search to try",
  error: "a step failed, so the run wrote the report with what it had",
} as const;

const failureText = (failure: WebFailure) =>
  `${failure.kind}: ${failure.detail}`;

function PageLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-sm underline-offset-3 outline-none hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono break-all">{children}</span>;
}

function Facts({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {children}
    </ul>
  );
}

function readStatus(row: ReadRow): RowParts["status"] {
  switch (row.phase) {
    case "reading":
      return {
        text: row.rendered ? "reading in a browser" : "reading",
        tone: "plain",
      };
    case "extracting":
      return { text: "drafting claims", tone: "plain" };
    case "checking":
      return { text: "checking claims", tone: "plain" };
    case "failed":
      return { text: "failed", tone: "bad" };
    case "read":
      return row.extractError
        ? { text: "read, no claims", tone: "warn" }
        : { text: "read", tone: "good" };
  }
}

function readBody(row: ReadRow): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <Facts>
        <li>
          <PageLink url={row.url}>
            <Mono>{row.url}</Mono>
          </PageLink>
        </li>
        {row.failure && (
          <li className="text-destructive">
            The page could not be read. <Mono>{failureText(row.failure)}</Mono>
          </li>
        )}
        {row.chars !== null && (
          <li>
            {row.chars.toLocaleString("en-US")} characters read
            {row.rendered ? ", after a second read in a browser" : ""}
            {row.via === "map" ? ", found through the site map" : ""}.
          </li>
        )}
        {row.extractError && (
          <li className="text-warning">
            No claims could be drafted from this page.{" "}
            <Mono>{row.extractError}</Mono>
          </li>
        )}
        {row.drafts !== null && (
          <li>
            {plural(row.drafts, "claim")} drafted: {row.verified.length}{" "}
            verified, {row.dropped.length} dropped.
          </li>
        )}
      </Facts>
      {(row.verified.length > 0 || row.dropped.length > 0) && (
        <ul className="flex flex-col gap-3">
          {row.verified.map((claim) => (
            <li key={`v-${claim.number}`}>
              <VerifiedItem claim={claim} />
            </li>
          ))}
          {row.dropped.map((claim, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a dropped claim has no id; the list only grows at its end
            <li key={`d-${i}`}>
              <DroppedItem claim={claim} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function partsOf(row: ActivityRow): RowParts {
  switch (row.kind) {
    case "plan": {
      const planned = row.queries.length + row.droppedQueries.length;
      return {
        icon: ListTreeIcon,
        title: "plan",
        detail:
          row.state === "running"
            ? "Splitting the question into searches"
            : `${plural(row.queries.length, "search", "searches")} planned${
                row.droppedQueries.length > 0
                  ? `, ${row.droppedQueries.length} dropped by the budget`
                  : ""
              }`,
        status: null,
        body:
          planned === 0 ? null : (
            <Facts>
              {row.queries.map((query, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the plan is fixed once the round starts
                <li key={i} className="flex flex-col gap-0.5">
                  <span className="text-foreground">{query.subQuestion}</span>
                  <Mono>{query.query}</Mono>
                </li>
              ))}
              {row.droppedQueries.map((query, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the plan is fixed once the round starts
                <li key={`dropped-${i}`} className="flex flex-col gap-0.5">
                  <span className="line-through">{query.subQuestion}</span>
                  <span>
                    <Mono>{query.query}</Mono>{" "}
                    <span className="text-warning">
                      dropped: over the search budget of the round
                    </span>
                  </span>
                </li>
              ))}
            </Facts>
          ),
      };
    }

    case "search": {
      const { outcome } = row;
      const results = outcome?.status === "ok" ? outcome.results : [];
      return {
        icon: SearchIcon,
        title: "search",
        detail: row.query.query,
        status:
          outcome === null
            ? row.state === "stopped"
              ? { text: "not finished", tone: "warn" }
              : null
            : outcome.status === "failed"
              ? { text: "failed", tone: "bad" }
              : results.length === 0
                ? { text: "no results", tone: "warn" }
                : { text: plural(results.length, "result"), tone: "plain" },
        body:
          outcome === null ? null : (
            <Facts>
              <li className="text-foreground">{row.query.subQuestion}</li>
              {outcome.status === "failed" && (
                <li className="text-destructive">
                  The search failed. <Mono>{failureText(outcome.failure)}</Mono>
                </li>
              )}
              {outcome.status === "ok" && results.length === 0 && (
                <li className="text-warning">
                  The search returned no results.
                </li>
              )}
              {results.map((result) => (
                <li key={result.url} className="flex gap-2">
                  <span className="w-4 shrink-0 text-right font-mono tabular-nums">
                    {result.position}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <PageLink url={result.url}>
                      <span className="text-foreground">{result.title}</span>
                    </PageLink>
                    <Mono>{domainOf(result.url)}</Mono>
                  </span>
                </li>
              ))}
            </Facts>
          ),
      };
    }

    case "select":
      return {
        icon: ListChecksIcon,
        title: "select",
        detail:
          row.state === "running"
            ? "Choosing the pages to read"
            : `${plural(row.picked.length, "page")} chosen${
                row.mapRequest ? ", 1 site map asked for" : ""
              }`,
        status: null,
        body:
          row.state === "running" ? null : (
            <Facts>
              {row.picked.map((page) => (
                <li key={page.url} className="flex flex-col">
                  <PageLink url={page.url}>
                    <span className="text-foreground">{page.title}</span>
                  </PageLink>
                  <Mono>{domainOf(page.url)}</Mono>
                </li>
              ))}
              {row.picked.length === 0 && <li>No page was chosen.</li>}
              {row.mapRequest && (
                <li>
                  Map asked for <Mono>{row.mapRequest.site}</Mono>:{" "}
                  {row.mapRequest.need}
                </li>
              )}
              {row.unknownNumbers.length > 0 && (
                <li className="text-warning">
                  The model named {plural(row.unknownNumbers.length, "result")}{" "}
                  that the round does not have ({row.unknownNumbers.join(", ")}
                  ). They were ignored.
                </li>
              )}
            </Facts>
          ),
      };

    case "map": {
      const { outcome } = row;
      return {
        icon: NetworkIcon,
        title: "map",
        detail: row.site.replace(/^https?:\/\//, ""),
        status:
          outcome === null
            ? row.state === "stopped"
              ? { text: "not finished", tone: "warn" }
              : null
            : outcome.status === "failed"
              ? { text: "failed", tone: "bad" }
              : {
                  text: `${outcome.listed} listed, ${outcome.picked.length} picked`,
                  tone: "plain",
                },
        body: (
          <Facts>
            {row.need && <li className="text-foreground">{row.need}</li>}
            {outcome?.status === "failed" && (
              <li className="text-destructive">
                The site could not be mapped.{" "}
                <Mono>{failureText(outcome.failure)}</Mono>
              </li>
            )}
            {outcome?.status === "ok" &&
              outcome.picked.map((url) => (
                <li key={url}>
                  <PageLink url={url}>
                    <Mono>{url}</Mono>
                  </PageLink>
                </li>
              ))}
            {outcome?.status === "ok" && outcome.picked.length === 0 && (
              <li>No page of the map was picked.</li>
            )}
          </Facts>
        ),
      };
    }

    case "read":
      return {
        icon: FileTextIcon,
        title: "read",
        detail: row.title,
        status: readStatus(row),
        body: readBody(row),
      };

    case "skipped":
      return {
        icon: SkipForwardIcon,
        title: "skipped",
        detail: `${plural(row.pages.length, "page")} found and not read`,
        status: null,
        body: (
          <Facts>
            {row.pages.map((page) => (
              <li key={page.url} className="flex flex-col">
                <PageLink url={page.url}>
                  <span className="text-foreground">{page.title}</span>
                </PageLink>
                <span>
                  <Mono>{page.domain}</Mono> · {SKIP_REASON[page.reason]}
                </span>
              </li>
            ))}
          </Facts>
        ),
      };

    case "gap":
      return {
        icon: ScanSearchIcon,
        title: "gap check",
        detail:
          row.answered === null
            ? "Checking what is still missing"
            : row.answered
              ? "The verified claims answer the question"
              : row.missing.length > 0
                ? `Missing: ${row.missing.join("; ")}`
                : "The question is not answered yet",
        status:
          row.answered === null
            ? null
            : row.answered
              ? { text: "answered", tone: "good" }
              : { text: "not answered", tone: "warn" },
        body:
          row.answered === null ||
          (row.missing.length === 0 && row.nextQueries.length === 0) ? null : (
            <Facts>
              {row.missing.map((part) => (
                <li key={part} className="text-foreground">
                  Missing: {part}
                </li>
              ))}
              {row.nextQueries.map((query, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the list is fixed once the gap check ends
                <li key={i}>
                  Next search: <Mono>{query.query}</Mono>
                </li>
              ))}
              {!row.answered && row.nextQueries.length === 0 && (
                <li>The gap check proposed no further search.</li>
              )}
            </Facts>
          ),
      };

    case "report": {
      const { check } = row;
      const chars = `${row.chars.toLocaleString("en-US")} characters`;
      return {
        icon: PenLineIcon,
        title: "report",
        detail:
          row.phase === "writing"
            ? row.state === "stopped"
              ? `Not finished, ${chars} written`
              : row.chars === 0
                ? "Writing the report"
                : `Writing, ${chars} so far`
            : row.phase === "checking"
              ? "Checking that every fact has a citation"
              : `${chars}, ${plural(row.cited, "claim")} cited`,
        status:
          row.writtenBy === null
            ? null
            : {
                text: `written by ${row.writtenBy === "model" ? "the model" : "code"}`,
                tone: "plain",
              },
        body:
          row.writtenBy === null ? null : (
            <Facts>
              {row.writtenBy === "code" && (
                <li>
                  No claim was verified, so code wrote a report that says so and
                  lists the searches.
                </li>
              )}
              {check && (
                <li>
                  Citation check: {plural(check.uncited, "sentence")} without a
                  citation, {check.facts} of them stated a fact,{" "}
                  {check.repaired} repaired, {check.removed} removed, with{" "}
                  {plural(check.modelCalls, "model call")}.
                </li>
              )}
              {row.removedCitations > 0 && (
                <li className="text-warning">
                  {plural(row.removedCitations, "citation")} of a claim that is
                  not verified removed.
                </li>
              )}
            </Facts>
          ),
      };
    }

    case "error":
      return {
        icon: TriangleAlertIcon,
        title: "error",
        detail: row.message,
        status: { text: `step ${row.step}`, tone: "bad" },
        body: (
          <Facts>
            <li className="text-destructive">
              The step <Mono>{row.step}</Mono> failed: {row.message}
            </li>
          </Facts>
        ),
      };

    case "end": {
      const { end } = row;
      if (end.status === "completed") {
        return {
          icon: FlagIcon,
          title: "end",
          detail: `Stopped because ${STOPPED_BY[end.stoppedBy]}`,
          status: { text: "completed", tone: "good" },
          body: null,
        };
      }
      if (end.status === "cancelled") {
        return {
          icon: BanIcon,
          title: "end",
          detail: "Cancelled. A cancelled run writes no report.",
          status: { text: "cancelled", tone: "warn" },
          body: null,
        };
      }
      return {
        icon: TriangleAlertIcon,
        title: "end",
        detail: end.message,
        status: { text: "failed", tone: "bad" },
        body: (
          <Facts>
            <li className="text-destructive">{end.message}</li>
          </Facts>
        ),
      };
    }
  }
}

function Row({
  row,
  open,
  onToggle,
  fresh,
}: {
  row: ActivityRow;
  open: boolean;
  onToggle: () => void;
  fresh: boolean;
}) {
  const bodyId = useId();
  const { icon: Icon, title, detail, status, body } = partsOf(row);
  const running = row.state === "running";
  const expandable = body !== null;
  const label =
    row.kind === "read" && row.label ? (
      <SourceLabelBadge label={row.label} className="h-4.5" />
    ) : null;

  const content = (
    <>
      <span
        className={cn(
          "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background transition-colors duration-200",
          running && "border-primary-ink",
          row.state === "failed" && "border-destructive text-destructive",
          row.state === "stopped" && "border-dashed text-muted-foreground",
        )}
      >
        {running ? (
          <GlyphSpinner className="text-xs" />
        ) : (
          <Icon
            aria-hidden
            className={cn(
              "size-3.5",
              row.state === "done" && "text-muted-foreground",
            )}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-xs font-medium">
            {title}
          </span>
          {status && (
            <span className={cn("min-w-0 truncate text-xs", TONE[status.tone])}>
              {status.text}
            </span>
          )}
          {label}
          <span className="ms-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {running ? (
              <Elapsed since={row.startedAt} className="text-primary-ink" />
            ) : row.state === "stopped" ? (
              "stopped"
            ) : row.durationMs === null ? null : (
              formatDuration(row.durationMs)
            )}
          </span>
        </span>
        <span
          className={cn(
            "line-clamp-2 text-xs text-pretty break-words text-muted-foreground",
            (row.kind === "search" || row.kind === "map") && "font-mono",
          )}
        >
          {detail}
        </span>
      </span>
      <ChevronRightIcon
        aria-hidden
        className={cn(
          "mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
          open && "rotate-90",
          !expandable && "invisible",
        )}
      />
    </>
  );

  return (
    <li
      className={cn(
        "relative",
        fresh &&
          "animate-in duration-200 fade-in slide-in-from-bottom-1 motion-reduce:animate-none",
      )}
    >
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {content}
        </button>
      ) : (
        <div className="flex w-full items-start gap-3 px-2 py-2">{content}</div>
      )}
      {expandable && open && (
        <div
          id={bodyId}
          className="ms-11 me-2 mb-2 animate-in rounded-lg bg-muted px-3 py-2.5 duration-200 fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          {body}
        </div>
      )}
    </li>
  );
}

/**
 * The timetable of the run: one row per action, grouped by round, in the order the run
 * took them. No row is ever removed (F4).
 */
export function ActivityList({
  groups,
  running,
}: {
  groups: readonly ActivityGroup[];
  running: boolean;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // Rows that are there on the first render appear at once. A row that arrives later
  // animates in.
  const initial = useRef<ReadonlySet<string> | null>(null);
  initial.current ??= new Set(
    groups.flatMap((group) => group.rows.map((row) => row.id)),
  );
  const present = initial.current;

  const toggle = (id: string) =>
    setOpen((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (groups.length === 0) {
    return (
      <p className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
        {running && <GlyphSpinner />}
        {running
          ? "Waiting for the first step of the run."
          : "This run took no step."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`${group.id}-heading`}>
          <h3
            id={`${group.id}-heading`}
            className="sticky top-0 z-20 flex items-center gap-2 bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {group.round === null ? "Report" : `Round ${group.round}`}
            <span aria-hidden className="h-px flex-1 bg-border" />
            <span className="font-mono tabular-nums">{group.rows.length}</span>
          </h3>
          <ol className="relative flex flex-col">
            <span
              aria-hidden
              className="absolute top-5 bottom-5 left-[19px] w-px bg-border"
            />
            {group.rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                open={open.has(row.id)}
                onToggle={() => toggle(row.id)}
                fresh={!present.has(row.id)}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
