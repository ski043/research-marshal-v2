import type {
  PageUrl,
  PlannedQuery,
  Question,
  SentenceVerdict,
  SourceLabel,
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

const SONNET = "claude-sonnet-5-5";

export type StepConfig = {
  model: string;
  effort: Effort;
  maxOutputTokens: number;
};

// Thinking counts toward maxOutputTokens. Each limit leaves several times the
// largest output seen in real runs (thinking and answer together).
export const MODEL_CONFIG: Readonly<Record<keyof ModelSteps, StepConfig>> =
  Object.freeze({
    plan: { model: SONNET, effort: "medium", maxOutputTokens: 4_000 },
    select: { model: SONNET, effort: "low", maxOutputTokens: 2_000 },
    pickFromMap: { model: SONNET, effort: "low", maxOutputTokens: 2_000 },
    extract: { model: SONNET, effort: "medium", maxOutputTokens: 8_000 },
    supports: { model: SONNET, effort: "low", maxOutputTokens: 2_000 },
    checkGaps: { model: SONNET, effort: "medium", maxOutputTokens: 4_000 },
    writeReport: { model: SONNET, effort: "medium", maxOutputTokens: 12_000 },
    // The largest answers on the three stored reports were 575 tokens to
    // classify and 275 to repair, thinking included.
    classifySentences: { model: SONNET, effort: "low", maxOutputTokens: 4_000 },
    repairSentences: {
      model: SONNET,
      effort: "medium",
      maxOutputTokens: 4_000,
    },
  });
