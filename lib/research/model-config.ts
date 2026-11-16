import {
  ModelChoice,
  type PageUrl,
  type PlannedQuery,
  type Question,
  type SentenceVerdict,
  type SourceLabel,
} from "./events";
import type { Numbered } from "./numbered";
import type { ReportBrief } from "./report";
import type { Candidate, VerifiedClaim } from "./run-view";

export type ClaimDraft = { statement: string; quote: string };

export type SentenceRepair = {
  sentence: number;
  action: "cite" | "rewrite" | "delete";
  claims: readonly number[];
  text: string;
};

// Longer than every real quote of the stored runs once link targets are left
// out. A quote over the cap is dropped as a V1 failure.
export const QUOTE_MAX_CHARS = 1_000;

export class MalformedAnswer extends Error {
  readonly step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
  }
}

export type ModelSteps = {
  plan(input: { question: Question }): Promise<readonly PlannedQuery[]>;
  select(input: {
    question: Question;
    queries: readonly PlannedQuery[];
    candidates: readonly Numbered<Candidate>[];
    mapAvailable: boolean;
  }): Promise<{
    picks: readonly number[];
    map: { result: number; need: string } | null;
  }>;
  pickFromMap(input: {
    question: Question;
    need: string;
    urls: readonly Numbered<PageUrl>[];
  }): Promise<{ picks: readonly number[] }>;
  extract(input: {
    question: Question;
    subQuestions: readonly string[];
    title: string;
    markdown: string;
  }): Promise<{ label: SourceLabel; claims: readonly ClaimDraft[] }>;
  supports(input: {
    statement: string;
    quote: string;
  }): Promise<{ supported: boolean; reason: string }>;
  checkGaps(input: {
    question: Question;
    subQuestions: readonly string[];
    searched: readonly string[];
    claims: readonly VerifiedClaim[];
  }): Promise<{
    answered: boolean;
    missing: readonly string[];
    queries: readonly PlannedQuery[];
  }>;
  writeReport(input: ReportBrief): AsyncIterable<string>;
  classifySentences(input: {
    question: Question;
    report: string;
    sentences: readonly string[];
  }): Promise<{
    verdicts: readonly {
      sentence: number;
      verdict: SentenceVerdict;
      reason: string;
    }[];
  }>;
  repairSentences(input: {
    question: Question;
    report: string;
    sentences: readonly { text: string; opening: boolean }[];
    claims: readonly VerifiedClaim[];
  }): Promise<{ repairs: readonly SentenceRepair[] }>;
};

export type Effort = "low" | "medium" | "high";

export type StepConfig = {
  model: string;
  effort: Effort;
  maxOutputTokens: number;
};

export type ModelInfo = { id: string; name: string; hint: string };

export const MODELS: Readonly<Record<ModelChoice, ModelInfo>> = Object.freeze({
  fable: {
    id: "claude-fable-5-2",
    name: "Fable 5.2",
    hint: "Most capable, slowest",
  },
  opus: { id: "claude-opus-5-5", name: "Opus 5.5", hint: "Deep reasoning" },
  sonnet: {
    id: "claude-sonnet-5-5",
    name: "Sonnet 5.5",
    hint: "Balanced, the default",
  },
  haiku: { id: "claude-haiku-5-5", name: "Haiku 5.5", hint: "Fastest" },
});

/** The switcher choices in display order. No model ID, so client code may import it. */
export const MODEL_OPTIONS: readonly {
  key: ModelChoice;
  name: string;
  hint: string;
}[] = Object.freeze(
  ModelChoice.options.map((key) => ({
    key,
    name: MODELS[key].name,
    hint: MODELS[key].hint,
  })),
);

// Thinking counts toward maxOutputTokens. Each limit leaves several times the
// largest output seen in real runs (thinking and answer together). The default
// effort differs by model, so every step sets its own.
const STEPS: Readonly<Record<keyof ModelSteps, Omit<StepConfig, "model">>> =
  Object.freeze({
    plan: { effort: "medium", maxOutputTokens: 4_000 },
    select: { effort: "low", maxOutputTokens: 2_000 },
    pickFromMap: { effort: "low", maxOutputTokens: 2_000 },
    extract: { effort: "medium", maxOutputTokens: 8_000 },
    supports: { effort: "low", maxOutputTokens: 2_000 },
    checkGaps: { effort: "medium", maxOutputTokens: 4_000 },
    writeReport: { effort: "medium", maxOutputTokens: 12_000 },
    // The largest answers on the three stored reports were 575 tokens to
    // classify and 275 to repair, thinking included.
    classifySentences: { effort: "low", maxOutputTokens: 4_000 },
    repairSentences: { effort: "medium", maxOutputTokens: 4_000 },
  });

export const MODEL_STEPS = Object.keys(STEPS) as readonly (keyof ModelSteps)[];

export function stepConfig(
  model: ModelChoice,
  step: keyof ModelSteps,
): StepConfig {
  return { model: MODELS[model].id, ...STEPS[step] };
}
