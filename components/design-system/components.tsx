import { ArrowUpIcon, RotateCwIcon, SquareIcon } from "lucide-react";
import type { ModelOption } from "@/components/app/model-select";
import type { Budget } from "@/components/app/start-chips";
import {
  type RunStatus,
  STATUS_LABEL,
  StatusIcon,
} from "@/components/app/status-icon";
import { GlyphSpinner } from "@/components/asciicn/glyph-spinner";
import {
  ActivityDemo,
  BudgetDemo,
  ChipsDemo,
  PromptDemo,
} from "@/components/design-system/demos";
import type { RunFixture } from "@/components/design-system/fixture";
import { Code, Part, Section } from "@/components/design-system/section";
import { Citation } from "@/components/run/citation";
import { SourceLabelBadge } from "@/components/run/source-label";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

const VARIANTS = [
  { variant: "default", use: "The one main action." },
  { variant: "secondary", use: "An action beside the main one." },
  { variant: "outline", use: "An action on a busy surface." },
  { variant: "ghost", use: "An action inside a row or a header." },
  { variant: "destructive", use: "An action that removes or stops." },
  { variant: "link", use: "An action in a line of text." },
] as const;

const SIZES = ["xs", "sm", "default", "lg"] as const;
const STATUSES: readonly RunStatus[] = [
  "running",
  "completed",
  "cancelled",
  "failed",
];

function Stage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-background p-4 ${className ?? ""}`}>
      {children}
    </div>
  );
}

export function ComponentsSection({
  run,
  models,
  defaultModel,
  budget,
}: {
  run: RunFixture;
  models: readonly ModelOption[];
  defaultModel: string;
  budget: Budget;
}) {
  return (
    <Section
      id="components"
      lead={
        <p>
          The real components of the app, not pictures of them. Each one is the
          file the app imports, fed with a small made-up run. They follow the
          theme of this page: switch it in the header to see the other one.
        </p>
      }
    >
      <Part
        id="components-buttons"
        title="Buttons"
        rule={
          <>
            <Code>components/ui/button.tsx</Code>. Six variants and four
            heights. A screen has one filled orange button at most.
          </>
        }
      >
        <Stage>
          <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {VARIANTS.map(({ variant, use }) => (
              <li
                key={variant}
                data-button-variant={variant}
                className="flex flex-col items-start gap-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant={variant}>
                    {variant === "default" ? "Ask a new question" : "Re-run"}
                  </Button>
                  <Button variant={variant} disabled>
                    Disabled
                  </Button>
                </div>
                <p className="text-xs text-pretty text-muted-foreground">
                  <span className="font-mono text-foreground">{variant}</span>{" "}
                  {use}
                </p>
              </li>
            ))}
          </ul>
          <ul className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-4 border-t pt-4">
            {SIZES.map((size) => (
              <li key={size} className="flex flex-col items-start gap-2">
                <Button variant="secondary" size={size}>
                  <RotateCwIcon aria-hidden />
                  Re-run
                </Button>
                <span className="font-mono text-xs text-muted-foreground">
                  {size}
                </span>
              </li>
            ))}
            <li className="flex flex-col items-start gap-2">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  aria-label="Start the run"
                  className="rounded-full"
                >
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  size="icon"
                  aria-label="Starting the run"
                  className="rounded-full"
                >
                  <GlyphSpinner className="text-primary-foreground" />
                </Button>
                <Button variant="outline" size="sm">
                  <SquareIcon aria-hidden />
                  Cancel
                </Button>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                icon, busy, with an icon
              </span>
            </li>
          </ul>
        </Stage>
      </Part>

      <Part
        id="components-statuses"
        title="Statuses"
        rule="A status is a word with an icon. One that went well is a quiet word. One that did not is a pill, so it differs by its shape and not only by its hue. The pills live in the Activity rows below."
      >
        <Stage className="flex flex-col gap-4">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {STATUSES.map((status) => (
              <li
                key={status}
                data-status={status}
                className="flex items-center gap-1.5 text-sm"
              >
                <StatusIcon status={status} />
                {STATUS_LABEL[status]}
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-2 border-t pt-4">
            {(["Paper", "Official", "News", "Blog"] as const).map((label) => (
              <li key={label}>
                <SourceLabelBadge label={label} />
              </li>
            ))}
            <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Kbd>Tab</Kbd> a key
            </li>
          </ul>
        </Stage>
      </Part>

      <Part
        id="components-citation"
        title="Citation"
        rule="A numbered chip in starlight blue. Hover or focus shows the quote, the source and its label. A click opens the source in a new tab."
      >
        <Stage>
          <p data-citation-demo className="max-w-2xl text-[0.9375rem]/7">
            {run.claim.statement} <Citation claim={run.claim} /> Every fact in a
            report ends in a chip like this one.
          </p>
        </Stage>
      </Part>

      <Part
        id="components-chips"
        title="Suggestion chips and budget pills"
        rule="An example question as a pill with a tinted icon, and the fixed limits of a run. The icon takes a tint of the scene. The text stays the quiet text."
      >
        <Stage>
          <ChipsDemo budget={budget} />
        </Stage>
      </Part>

      <Part
        id="components-budget"
        title="Budget meters"
        rule="One segment per unit of the budget, filled in starlight blue. The number beside it is mono, so it does not jump when it changes."
      >
        <div className="max-w-md">
          <BudgetDemo budget={run.budget} totals={run.totals} />
        </div>
      </Part>

      <Part
        id="components-activity"
        title="Activity rows"
        rule="One row per action of a run. The ring of the icon says the state: orange while it runs, grey when it is done, red when it failed, dashed when the run ended before it did. A row that went through Decodo carries its mark. Open a row to see what it found."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Stage className="p-2">
            <ActivityDemo groups={run.running} running />
          </Stage>
          <Stage className="self-start p-2">
            <ActivityDemo groups={run.stopped} running={false} />
          </Stage>
        </div>
      </Part>

      <Part
        id="components-prompt"
        title="Prompt box"
        rule="The one form of the app. It stands on the night of the start screen in both themes, so it takes the dark tokens."
      >
        <div className="dark rounded-2xl border bg-[#050608] px-4 py-8 text-foreground sm:px-8">
          <div className="mx-auto max-w-2xl">
            <PromptDemo models={models} defaultModel={defaultModel} />
          </div>
        </div>
      </Part>
    </Section>
  );
}
