"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  type RunStatus,
  STATUS_LABEL,
  StatusIcon,
} from "@/components/app/status-icon";
import { Input } from "@/components/ui/input";
import {
  formatDateTime,
  groupByDay,
  plural,
  relativeTime,
} from "@/lib/ui/format";
import { cn } from "@/lib/utils";

export type HistoryEntry = {
  runId: string;
  question: string;
  status: RunStatus;
  model: string;
  createdAt: string;
};

/**
 * Every stored run under one heading per day (U8), with a filter over the questions.
 * `now` is the moment the server rendered the list, so the first client render matches
 * it; after that a clock keeps the relative times current.
 */
export function HistoryList({
  runs,
  now: renderedAt,
}: {
  runs: readonly HistoryEntry[];
  now: string;
}) {
  const filterId = useId();
  const active = useParams<{ runId?: string }>().runId;
  const [filter, setFilter] = useState("");
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    setNow(renderedAt);
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(timer);
  }, [renderedAt]);

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? runs.filter((run) => run.question.toLowerCase().includes(needle))
    : runs;
  const clock = new Date(now);
  const groups = groupByDay(shown, (run) => new Date(run.createdAt), clock);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pb-2">
        <label htmlFor={filterId} className="sr-only">
          Filter the history
        </label>
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-2 left-5.5 size-4 text-muted-foreground"
        />
        <Input
          id={filterId}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter the history"
          className="bg-background ps-8 text-sm dark:bg-background"
        />
      </div>
      <nav
        aria-label="Past runs"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]"
      >
        {runs.length === 0 ? (
          <p className="px-3 py-6 text-sm text-pretty text-muted-foreground">
            No runs yet. Ask a research question and it appears here, with every
            step it took.
          </p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted-foreground">
            No question matches “{filter.trim()}”.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="flex items-center justify-between px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground">
                {group.label}
                <span className="tabular-nums">{group.items.length}</span>
              </h2>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((run) => {
                  const on = run.runId === active;
                  const created = new Date(run.createdAt);
                  return (
                    <li key={run.runId}>
                      <Link
                        href={`/runs/${run.runId}`}
                        aria-current={on ? "page" : undefined}
                        title={`${run.question}\n${STATUS_LABEL[run.status]} · ${run.model} · ${formatDateTime(created)}`}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring",
                          on
                            ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                        )}
                      >
                        <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                          <StatusIcon status={run.status} />
                        </span>
                        <span className="sr-only">
                          {STATUS_LABEL[run.status]}:
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{run.question}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {run.model}
                            {" · "}
                            <time
                              dateTime={run.createdAt}
                              className="tabular-nums"
                            >
                              {relativeTime(created, clock)}
                            </time>
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </nav>
      <p className="sr-only" aria-live="polite">
        {needle ? plural(shown.length, "run") : ""}
      </p>
    </div>
  );
}
