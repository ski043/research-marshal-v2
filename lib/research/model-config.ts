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

export const MODEL_CONFIG: Readonly<
  Record<
    keyof ModelSteps,
    { model: string; effort: Effort; maxOutputTokens?: number }
  >
> = Object.freeze({
  plan: { model: SONNET, effort: "medium" },
  select: { model: SONNET, effort: "low" },
  pickFromMap: { model: SONNET, effort: "low" },
  extract: { model: SONNET, effort: "medium" },
  supports: { model: SONNET, effort: "low" },
  checkGaps: { model: SONNET, effort: "medium" },
  writeReport: { model: SONNET, effort: "medium" },
  // Several times the largest answer of the three stored reports, thinking
  // included: 575 tokens to classify, 275 to repair.
  classifySentences: { model: SONNET, effort: "low", maxOutputTokens: 4_000 },
  repairSentences: { model: SONNET, effort: "medium", maxOutputTokens: 4_000 },
});
