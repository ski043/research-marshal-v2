"use client";

import { XIcon } from "lucide-react";
import { ActivityList } from "@/components/run/activity-list";
import { BudgetCard } from "@/components/run/budget-card";
import { ClaimsList } from "@/components/run/claims-list";
import { DecodoMark } from "@/components/run/decodo-mark";
import { SourcesList } from "@/components/run/sources-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type RunView, sourcesOf } from "@/lib/research/run-view";
import { type ActivityGroup, rowCount } from "@/lib/ui/activity";
import { totalsOf } from "@/lib/ui/totals";
import { useFollow } from "@/lib/ui/use-follow";

const TAB =
  "h-7 flex-none gap-1.5 px-2.5 text-xs data-active:bg-background data-active:shadow-xs dark:data-active:border-transparent dark:data-active:bg-accent";
const PANE =
  "min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 [scrollbar-width:thin]";

function Count({ children }: { children: number }) {
  return (
    <span className="font-mono tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Everything the run did, beside the report: the budget, then the Activity timetable,
 * the live source list and the claims, and at the foot the credit of the web data.
 */
export function ProgressPanel({
  view,
  groups,
  startedAt,
  totalMs,
  onClose,
}: {
  view: RunView;
  groups: readonly ActivityGroup[];
  startedAt: string | null;
  totalMs: number | null;
  onClose: () => void;
}) {
  const running = view.status === "running";
  const sources = sourcesOf(view);
  const rows = rowCount(groups);
  const activity = useFollow<HTMLDivElement>(rows, running);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-13 shrink-0 items-center justify-between gap-2 border-b ps-4 pe-3">
        <h2 className="text-sm font-medium">Progress</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close the progress panel"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div className="shrink-0 p-3">
        <BudgetCard
          budget={view.budget}
          totals={totalsOf(view)}
          running={running}
          startedAt={startedAt}
          totalMs={totalMs}
        />
      </div>
      <Tabs defaultValue="activity" className="min-h-0 flex-1 gap-2">
        <TabsList className="mx-3 h-8 w-auto justify-start self-stretch">
          <TabsTrigger value="activity" className={TAB}>
            Activity <Count>{rows}</Count>
          </TabsTrigger>
          <TabsTrigger value="sources" className={TAB}>
            Sources <Count>{sources.length}</Count>
          </TabsTrigger>
          <TabsTrigger value="claims" className={TAB}>
            Claims <Count>{view.verified.length + view.dropped.length}</Count>
          </TabsTrigger>
        </TabsList>
        {/* Stays mounted, so the list keeps its scroll position and its scroll listener across tabs. */}
        <TabsContent
          value="activity"
          ref={activity}
          keepMounted
          className={PANE}
        >
          <ActivityList groups={groups} running={running} />
        </TabsContent>
        <TabsContent value="sources" className={PANE}>
          <SourcesList sources={sources} running={running} />
        </TabsContent>
        <TabsContent value="claims" className={`${PANE} px-3 pt-1`}>
          <ClaimsList verified={view.verified} dropped={view.dropped} />
        </TabsContent>
      </Tabs>
      <p className="flex shrink-0 justify-center border-t px-3 py-2 text-xs text-muted-foreground">
        <a
          href="https://decodo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-sm transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Web data by
          <DecodoMark wordmark className="h-2.5 w-auto" />
          <span className="sr-only">Decodo (opens in a new tab)</span>
        </a>
      </p>
    </div>
  );
}
