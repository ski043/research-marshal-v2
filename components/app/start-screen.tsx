"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { SidebarTrigger } from "@/components/app/app-shell";
import type { ModelOption } from "@/components/app/model-select";
import { PromptBox } from "@/components/app/prompt-box";
import {
  type Budget,
  BudgetPills,
  SuggestionChips,
} from "@/components/app/start-chips";
import { StartBackground } from "@/components/asciicn/start-background";
import { greetingFor } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

const GREETING_ID = "greeting";
// The server cannot know the local time. This runs before the first paint and writes
// the greeting of the hour, so the heading never changes in front of the user.
const GREET = `(function(){var h=new Date().getHours();var e=document.getElementById(${JSON.stringify(GREETING_ID)});if(e)e.textContent=h>=5&&h<12?"Good morning":h>=12&&h<18?"Good afternoon":"Good evening"})()`;

const INVITATION = "Ask a research question…";
const ROTATING = [
  "Are sodium-ion batteries ready for grid storage?",
  "Which countries restrict PFAS in consumer products?",
  "How well do heat pumps work below minus 15 °C?",
  "What explains the decline of insects in Europe?",
  "Do congestion charges reduce city traffic?",
] as const;

const TYPE_STEP = 6;
const TYPE_INTERVAL_MS = 16;

export function StartScreen({
  models,
  defaultModel,
  budget,
}: {
  models: readonly ModelOption[];
  defaultModel: string;
  budget: Budget;
}) {
  const [question, setQuestion] = useState("");
  const budgetId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const typing = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTyping = () => {
    if (typing.current) clearInterval(typing.current);
    typing.current = null;
  };
  useEffect(
    () => () => {
      if (typing.current) clearInterval(typing.current);
    },
    [],
  );

  const type = (text: string) => {
    stopTyping();
    input.current?.focus();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setQuestion(text);
      return;
    }
    let length = 0;
    typing.current = setInterval(() => {
      length = Math.min(text.length, length + TYPE_STEP);
      setQuestion(text.slice(0, length));
      if (length >= text.length) stopTyping();
    }, TYPE_INTERVAL_MS);
  };

  return (
    // The scene paints its own night, so the screen takes the dark tokens in both themes
    // and has the dusk of the scene from the first paint, before the scene has loaded.
    <main className="dark relative isolate flex min-w-0 flex-1 flex-col overflow-hidden bg-sidebar text-foreground lg:rounded-2xl lg:border lg:shadow-xs">
      <StartBackground />
      <div className="flex h-13 shrink-0 items-center px-3 lg:hidden">
        <SidebarTrigger />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="m-auto flex w-full max-w-2xl flex-col px-4 py-10 sm:px-8">
          <div className="mb-8 flex animate-in flex-col items-center gap-4 text-center duration-300 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
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
            onQuestionChange={(text) => {
              stopTyping();
              setQuestion(text);
            }}
            models={models}
            defaultModel={defaultModel}
            inputRef={input}
            invitation={INVITATION}
            examples={ROTATING}
          >
            <div className="-mt-3 flex items-center gap-2 rounded-b-2xl border border-t-0 bg-muted/48 px-3 pt-5.5 pb-2.5">
              <span
                id={budgetId}
                title="The limits of one run are fixed."
                className="shrink-0 text-xs text-muted-foreground"
              >
                Budget
              </span>
              <FadeScroller className="-my-1 min-w-0 flex-1 py-1">
                <BudgetPills budget={budget} labelledBy={budgetId} />
              </FadeScroller>
            </div>
          </PromptBox>

          <SuggestionChips className="mt-6" onPick={type} />

          <p className="mt-6 text-center text-xs text-pretty text-muted-foreground">
            Every fact in the report carries a quote that was checked on its
            page.
          </p>
        </div>
      </div>
    </main>
  );
}

/** A row that scrolls sideways and fades at each edge that has more behind it. */
function FadeScroller({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn("overflow-x-auto [scrollbar-width:none]", className)}
      style={{
        maskImage: `linear-gradient(to right, ${edges.start ? "transparent, black 1.5rem" : "black, black"}, ${edges.end ? "black calc(100% - 1.5rem), transparent" : "black, black"})`,
      }}
    >
      {children}
    </div>
  );
}
