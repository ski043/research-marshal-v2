"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useSidebar } from "@/components/app/app-shell";
import { RAIL_ONLY, ROW, WIDE_ONLY } from "@/components/app/sidebar-classes";
import { type RunStatus, STATUS_LABEL } from "@/components/app/status-icon";
import { formatDateTime, groupByAge, plural } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

export type HistoryEntry = {
  runId: string;
  question: string;
  status: RunStatus;
  model: string;
  createdAt: string;
};

/**
 * Every stored run (U8) as one line under a heading for its age, with a search over the
 * questions. `now` is the moment the server rendered the list, so the first client render
 * matches it; after that a clock moves a run to the next heading when the day changes.
 */
export function HistoryList({
  runs,
  now: renderedAt,
}: {
  runs: readonly HistoryEntry[];
  now: string;
}) {
  const searchId = useId();
  const searchField = useRef<HTMLInputElement>(null);
  const { setSidebar } = useSidebar();
  const active = useParams<{ runId?: string }>().runId;
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    setNow(renderedAt);
    const timer = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, [renderedAt]);

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? runs.filter((run) => run.question.toLowerCase().includes(needle))
    : runs;
  const groups = groupByAge(
    shown,
    (run) => new Date(run.createdAt),
    new Date(now),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-2 pb-1">
        <div className={WIDE_ONLY}>
          <label htmlFor={searchId} className="sr-only">
            Search the history
          </label>
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-2.5 left-4.5 size-4 text-muted-foreground"
          />
          <input
            ref={searchField}
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-lg bg-transparent ps-9 pe-2.5 text-sm text-foreground outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:bg-sidebar-accent/60 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-sidebar-ring [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <button
          type="button"
          aria-label="Search the history"
          title="Search"
          onClick={() => {
            setSidebar("expanded");
            searchField.current?.focus();
          }}
          className={`absolute top-0 left-2 hidden lg:flex ${ROW} ${RAIL_ONLY}`}
        >
          <SearchIcon aria-hidden className="size-4 shrink-0" />
        </button>
      </div>
      <nav
        aria-label="Past runs"
        // `relative` keeps the visually hidden state of each row inside this scroller.
        // Without it the document grows as tall as the list.
        className={`relative min-h-0 flex-1 overflow-y-auto px-2 pb-6 ${WIDE_ONLY} [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)] [scrollbar-width:thin]`}
      >
        {runs.length === 0 ? (
          <p className="px-2.5 pt-4 text-sm text-pretty text-muted-foreground">
            No runs yet. Ask a research question and it appears here, with every
            step it took.
          </p>
        ) : shown.length === 0 ? (
          <p className="px-2.5 pt-4 text-sm text-pretty break-words text-muted-foreground">
            No question matches “{search.trim()}”.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="px-2.5 pt-4 pb-1.5 text-xs font-medium text-muted-foreground">
                {group.label}
              </h2>
              <ul>
                {group.items.map((run) => {
                  const on = run.runId === active;
                  return (
                    <li key={run.runId}>
                      <Link
                        href={`/runs/${run.runId}`}
                        aria-current={on ? "page" : undefined}
                        title={`${run.question}\n${STATUS_LABEL[run.status]} · ${run.model} · ${formatDateTime(new Date(run.createdAt))}`}
                        className={cn(
                          "flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring",
                          on
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        )}
                      >
                        <span className="sr-only">
                          {STATUS_LABEL[run.status]}:
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {run.question}
                        </span>
                        {run.status === "running" && (
                          <span aria-hidden className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
                            <span className="relative inline-flex size-2 rounded-full bg-primary" />
                          </span>
                        )}
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
