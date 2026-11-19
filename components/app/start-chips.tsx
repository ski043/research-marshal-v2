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
import { plural } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

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

/** The example questions under the prompt box. A click hands the question to `onPick`. */
export function SuggestionChips({
  onPick,
  className,
}: {
  onPick: (question: string) => void;
  className?: string;
}) {
  return (
    <ul
      aria-label="Example questions"
      className={cn("flex flex-wrap justify-center gap-2", className)}
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
            onClick={() => onPick(suggestion.question)}
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
  );
}

export type Budget = {
  rounds: number;
  queriesPerRound: number;
  readsPerRound: number;
  mapsPerRun: number;
};

/** The fixed limits of one run, as the pills under the prompt box. */
export function BudgetPills({
  budget,
  labelledBy,
}: {
  budget: Budget;
  labelledBy: string;
}) {
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
    <ul aria-labelledby={labelledBy} className="flex gap-1.5">
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
  );
}
