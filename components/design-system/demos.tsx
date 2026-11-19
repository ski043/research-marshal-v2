"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ModelOption } from "@/components/app/model-select";
import { PromptBox } from "@/components/app/prompt-box";
import {
  type Budget,
  BudgetPills,
  SuggestionChips,
} from "@/components/app/start-chips";
import { ActivityList } from "@/components/run/activity-list";
import { BudgetCard } from "@/components/run/budget-card";
import type { BudgetUsage } from "@/lib/research/run-view";
import type { ActivityGroup } from "@/lib/ui/activity";
import type { RunTotals } from "@/lib/ui/totals";

const RUNNING_FOR_MS = 7000;

/**
 * The moment the demo run "started". The fixture carries fixed times, and a clock that
 * counts from one of them would show hours, so the open row starts when the page does.
 */
function useStartedAt(): string | null {
  const [since, setSince] = useState<string | null>(null);
  useEffect(() => {
    setSince(new Date(Date.now() - RUNNING_FOR_MS).toISOString());
  }, []);
  return since;
}

export function BudgetDemo({
  budget,
  totals,
}: {
  budget: BudgetUsage;
  totals: RunTotals;
}) {
  const since = useStartedAt();
  return (
    <BudgetCard
      budget={budget}
      totals={totals}
      running
      startedAt={since}
      totalMs={null}
    />
  );
}

export function ActivityDemo({
  groups,
  running,
}: {
  groups: readonly ActivityGroup[];
  running: boolean;
}) {
  const since = useStartedAt();
  const live = groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) =>
      row.state === "running" ? { ...row, startedAt: since } : row,
    ),
  }));
  return <ActivityList groups={live} running={running} />;
}

export function ChipsDemo({ budget }: { budget: Budget }) {
  const [picked, setPicked] = useState<string | null>(null);
  const budgetId = useId();
  return (
    <div className="flex flex-col items-center gap-4">
      <SuggestionChips onPick={setPicked} />
      <p
        aria-live="polite"
        data-picked
        className="min-h-4 text-center text-xs text-pretty text-muted-foreground"
      >
        {picked ?? "A click types the question into the prompt box."}
      </p>
      <div className="flex max-w-full items-center gap-2 overflow-x-auto [scrollbar-width:none]">
        <span id={budgetId} className="shrink-0 text-xs text-muted-foreground">
          Budget
        </span>
        <BudgetPills budget={budget} labelledBy={budgetId} />
      </div>
    </div>
  );
}

/** The real prompt box. On this page a submit starts no run. */
export function PromptDemo({
  models,
  defaultModel,
}: {
  models: readonly ModelOption[];
  defaultModel: string;
}) {
  const [question, setQuestion] = useState("");
  const [held, setHeld] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  return (
    <div
      data-prompt-demo
      // The form of the box has a Server Action. Stopping the event here, before the
      // form sees it, keeps the page from starting a run.
      onSubmitCapture={(event) => {
        event.preventDefault();
        setHeld(true);
      }}
    >
      <PromptBox
        question={question}
        onQuestionChange={(text) => {
          setHeld(false);
          setQuestion(text);
        }}
        models={models}
        defaultModel={defaultModel}
        inputRef={input}
        invitation="Ask a research question…"
        examples={[
          "Are sodium-ion batteries ready for grid storage?",
          "Do congestion charges reduce city traffic?",
        ]}
      />
      <p
        aria-live="polite"
        data-held={held ? "" : undefined}
        className="mt-3 min-h-4 text-center text-xs text-muted-foreground"
      >
        {held
          ? "On the start screen this would start the run. Here it starts nothing."
          : "Enter starts the run, Shift and Enter breaks the line. Here it starts nothing."}
      </p>
    </div>
  );
}
