"use client";

import {
  BatteryChargingIcon,
  CalendarDaysIcon,
  FileTextIcon,
  type LucideIcon,
  MapIcon,
  MicroscopeIcon,
  MoonStarIcon,
  RefreshCwIcon,
  SearchIcon,
  ShipIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { SidebarTrigger } from "@/components/app/app-shell";
import type { ModelOption } from "@/components/app/model-select";
import { PromptBox } from "@/components/app/prompt-box";
import { StartBackground } from "@/components/asciicn/start-background";
import { greetingFor, plural } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

const GREETING_ID = "greeting";
// The server cannot know the local time. This runs before the first paint and writes
// the greeting of the hour, so the heading never changes in front of the user.
const GREET = `(function(){var h=new Date().getHours();var e=document.getElementById(${JSON.stringify(GREETING_ID)});if(e)e.textContent=h>=5&&h<12?"Good morning":h>=12&&h<18?"Good afternoon":"Good evening"})()`;

// The colours of the scene behind the screen: its stars, its dusk, its lamps, its bridge.
type Tone = "starlight" | "violet" | "amber" | "rose" | "orange";

const INK: Readonly<Record<Tone, string>> = {
  starlight: "text-ascii-blue",
  violet: "text-ascii-purple",
  amber: "text-highlight",
  rose: "text-ascii-pink",
  orange: "text-ascii-orange",
};

const TILE: Readonly<Record<Tone, string>> = {
  starlight: "bg-ascii-blue/12 text-ascii-blue",
  violet: "bg-ascii-purple/12 text-ascii-purple",
  amber: "bg-highlight/12 text-highlight",
  rose: "bg-ascii-pink/12 text-ascii-pink",
  orange: "bg-ascii-orange/12 text-ascii-orange",
};

type Suggestion = {
  title: string;
  question: string;
  icon: LucideIcon;
  tone: Tone;
};

const SUGGESTIONS: readonly Suggestion[] = [
  {
    title: "Battery lifespan",
    question:
      "How many charge cycles do lithium iron phosphate batteries last, and what shortens their life?",
    icon: BatteryChargingIcon,
    tone: "amber",
  },
  {
    title: "Microplastics and health",
    question:
      "What is known about the health effects of microplastics in the human body?",
    icon: MicroscopeIcon,
    tone: "rose",
  },
  {
    title: "Four-day work week",
    question:
      "What did the large trials of a four-day work week find about productivity?",
    icon: CalendarDaysIcon,
    tone: "orange",
  },
  {
    title: "Suez Canal blockage",
    question: "How did the 2021 Suez Canal blockage affect global trade?",
    icon: ShipIcon,
    tone: "starlight",
  },
  {
    title: "Sleep trackers",
    question:
      "How accurate are consumer sleep trackers compared with a sleep laboratory?",
    icon: MoonStarIcon,
    tone: "violet",
  },
];

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

  const limits: readonly { label: string; icon: LucideIcon; tone: Tone }[] = [
    {
      label: plural(budget.rounds, "round"),
      icon: RefreshCwIcon,
      tone: "starlight",
    },
    {
      label: `${plural(budget.queriesPerRound, "search", "searches")} per round`,
      icon: SearchIcon,
      tone: "orange",
    },
    {
      label: `${plural(budget.readsPerRound, "page")} per round`,
      icon: FileTextIcon,
      tone: "amber",
    },
    {
      label: plural(budget.mapsPerRun, "site map"),
      icon: MapIcon,
      tone: "violet",
    },
  ];

  return (
    // The scene paints its own night, so the screen takes the dark tokens in both themes
    // and has the dusk of the scene from the first paint, before the scene has loaded.
    <main className="dark relative isolate flex min-w-0 flex-1 flex-col overflow-hidden bg-[#050608] text-foreground lg:rounded-2xl lg:border lg:shadow-xs">
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
                <ul aria-labelledby={budgetId} className="flex gap-1.5">
                  {limits.map((limit) => (
                    <li
                      key={limit.label}
                      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-background ps-1 pe-2.5 text-xs font-medium text-foreground/80"
                    >
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full",
                          TILE[limit.tone],
                        )}
                      >
                        <limit.icon aria-hidden className="size-3" />
                      </span>
                      {limit.label}
                    </li>
                  ))}
                </ul>
              </FadeScroller>
            </div>
          </PromptBox>

          <ul
            aria-label="Example questions"
            className="mt-6 flex flex-wrap justify-center gap-2"
          >
            {SUGGESTIONS.map((suggestion, index) => (
              <li
                key={suggestion.title}
                className="animate-in duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] fill-mode-backwards fade-in slide-in-from-bottom-1.5 motion-reduce:animate-none"
                style={{ animationDelay: `${40 + 30 * index}ms` }}
              >
                <button
                  type="button"
                  title={suggestion.question}
                  onClick={() => type(suggestion.question)}
                  className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border bg-background px-3 text-xs text-muted-foreground outline-none transition-[background-color,border-color,color,scale] duration-150 ease-out hover:border-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] sm:text-sm"
                >
                  <suggestion.icon
                    aria-hidden
                    className={cn("size-3.5 shrink-0", INK[suggestion.tone])}
                  />
                  {suggestion.title}
                </button>
              </li>
            ))}
          </ul>

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
