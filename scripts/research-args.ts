import { DEFAULT_MODEL, ModelChoice, type RunId } from "@/lib/research/events";
import {
  countsOf,
  type ModelTotals,
  modelTotalsOf,
  type RunCounts,
} from "@/lib/research/inspect";
import type { RunView } from "@/lib/research/run-view";

export const EXIT = Object.freeze({
  completed: 0,
  failed: 1,
  usage: 2,
  cancelled: 3,
});

export const USAGE = `Usage: pnpm research [--model <m>] [--json] "your research question"
       pnpm research:offline <scenario> [--pace <ms>] [--json] ["question"]

  --model <m>    the model of every step: ${ModelChoice.options.join(", ")} (default ${DEFAULT_MODEL})
  --json         end with one JSON summary line on stdout
  --offline <s>  run scenario <s> on the fake web and model: no network, no API keys
  --pace <ms>    offline only: wait <ms> before each web call, model step and report chunk
Exit codes: 0 completed, 1 failed, 2 usage error, 3 cancelled, 130 second Ctrl-C.`;

/** A run that never sealed, or whose row is gone, counts as failed. */
export function exitCodeOf(status: RunView["status"] | null): number {
  if (status === "completed") return EXIT.completed;
  if (status === "cancelled") return EXIT.cancelled;
  return EXIT.failed;
}

export type ResearchArgs = {
  question: string;
  model: ModelChoice;
  json: boolean;
  offline: { scenario: string; paceMs: number } | null;
};

export function parseResearchArgs(
  argv: readonly string[],
): { ok: true; args: ResearchArgs } | { ok: false; error: string } {
  const words: string[] = [];
  let json = false;
  let model: ModelChoice = DEFAULT_MODEL;
  let scenario: string | null = null;
  let paceMs: number | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) return null;
      i += 1;
      return next;
    };
    if (arg === "--") {
      words.push(...argv.slice(i + 1));
      break;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--model") {
      const parsed = ModelChoice.safeParse(value());
      if (!parsed.success)
        return {
          ok: false,
          error: `--model needs one of ${ModelChoice.options.join(", ")}.`,
        };
      model = parsed.data;
    } else if (arg === "--offline") {
      scenario = value();
      if (scenario === null)
        return { ok: false, error: "--offline needs a scenario name." };
    } else if (arg === "--pace") {
      const text = value();
      paceMs = text !== null && /^\d+$/.test(text) ? Number(text) : null;
      if (paceMs === null)
        return {
          ok: false,
          error: "--pace needs a whole number of milliseconds.",
        };
    } else if (arg.startsWith("--")) {
      return { ok: false, error: `Unknown option ${arg}.` };
    } else {
      words.push(arg);
    }
  }
  if (paceMs !== null && scenario === null) {
    return { ok: false, error: "--pace works only with --offline." };
  }
  return {
    ok: true,
    args: {
      question: words.join(" "),
      model,
      json,
      offline: scenario === null ? null : { scenario, paceMs: paceMs ?? 0 },
    },
  };
}

export type ResearchSummary = {
  runId: RunId;
  status: RunView["status"] | null;
  stoppedBy: string | null;
  exitCode: number;
  wallMs: number;
  model?: ModelTotals;
} & Partial<RunCounts>;

export function summaryLine(
  runId: RunId,
  view: RunView | null,
  wallMs: number,
): string {
  const summary: ResearchSummary = {
    runId,
    status: view?.status ?? null,
    stoppedBy: view?.end?.status === "completed" ? view.end.stoppedBy : null,
    exitCode: exitCodeOf(view?.status ?? null),
    wallMs: Math.round(wallMs),
    ...(view ? { ...countsOf(view), model: modelTotalsOf(view) } : {}),
  };
  return JSON.stringify(summary);
}
