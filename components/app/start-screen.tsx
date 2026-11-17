"use client";

import { useRef, useState } from "react";
import { SidebarTrigger } from "@/components/app/app-shell";
import type { ModelOption } from "@/components/app/model-select";
import { PromptBox } from "@/components/app/prompt-box";
import { GlobeMark } from "@/components/asciicn/globe-mark";
import {
  DEFAULT_START_VARIANT,
  StartBackground,
  type StartVariant,
  startVariantSpec,
} from "@/components/asciicn/start-background";
import { greetingFor } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

const GREETING_ID = "greeting";
// The server cannot know the local time. This runs before the first paint and writes
// the greeting of the hour, so the heading never changes in front of the user.
const GREET = `(function(){var h=new Date().getHours();var e=document.getElementById(${JSON.stringify(GREETING_ID)});if(e)e.textContent=h>=5&&h<12?"Good morning":h>=12&&h<18?"Good afternoon":"Good evening"})()`;

const EXAMPLES = [
  "How long do lithium iron phosphate batteries last?",
  "What is known about the health effects of microplastics?",
  "How did the 2021 Suez Canal blockage affect global trade?",
  "Does a four-day work week change productivity?",
] as const;

export type Budget = {
  rounds: number;
  queriesPerRound: number;
  readsPerRound: number;
  mapsPerRun: number;
};

export function StartScreen({
  models,
  defaultModel,
  budget,
  variant = DEFAULT_START_VARIANT,
}: {
  models: readonly ModelOption[];
  defaultModel: string;
  budget: Budget;
  variant?: StartVariant;
}) {
  const ground = startVariantSpec(variant);
  const [question, setQuestion] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  const fill = (text: string) => {
    setQuestion(text);
    input.current?.focus();
  };

  return (
    <main
      className={cn(
        "relative isolate flex min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground lg:rounded-2xl lg:border lg:shadow-xs",
        ground.screen,
      )}
    >
      <StartBackground variant={variant} />
      <div className="flex h-13 shrink-0 items-center px-3 lg:hidden">
        <SidebarTrigger />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="m-auto flex w-full max-w-2xl flex-col px-4 py-10 sm:px-8">
          <div
            className={cn(
              "mb-8 flex animate-in flex-col items-center gap-4 text-center duration-300 fade-in slide-in-from-bottom-2 motion-reduce:animate-none",
              ground.hero,
            )}
          >
            {ground.mark && <GlobeMark />}
            <h1
              id={GREETING_ID}
              suppressHydrationWarning
              className="text-2xl font-medium tracking-tight text-balance sm:text-[1.875rem] sm:leading-tight"
            >
              {typeof window === "undefined"
                ? "Good day"
                : greetingFor(new Date().getHours())}
            </h1>
            <script
              type={
                typeof window === "undefined" ? "text/javascript" : "text/plain"
              }
              suppressHydrationWarning
              // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script, no user input
              dangerouslySetInnerHTML={{ __html: GREET }}
            />
          </div>

          <PromptBox
            question={question}
            onQuestionChange={setQuestion}
            models={models}
            defaultModel={defaultModel}
            inputRef={input}
          />

          <p className="mt-3 text-center text-xs text-pretty text-muted-foreground">
            One run takes at most {budget.rounds} rounds, each with{" "}
            {budget.queriesPerRound} searches and {budget.readsPerRound} pages,
            and {budget.mapsPerRun} site map. Every fact in the report carries a
            quote that was checked on its page.
          </p>

          <ul
            aria-label="Example questions"
            className="mt-6 flex flex-wrap justify-center gap-2"
          >
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => fill(example)}
                  className="inline-flex min-h-8 items-center rounded-full border bg-background px-3 py-1 text-left text-xs text-muted-foreground transition-[background-color,border-color,color,scale] duration-150 hover:border-input hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98] sm:text-sm"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
