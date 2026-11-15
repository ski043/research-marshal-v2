import type { PageUrl, PlannedQuery, Question, SourceLabel } from "./events";
import type { Numbered } from "./numbered";
import type { ReportBrief } from "./report";
import type { Candidate, VerifiedClaim } from "./run-view";

export type ClaimDraft = { statement: string; quote: string };

// One answer that did not match its schema. Local to one page (extract) or one claim
// (supports); every other model failure is a FatalRunError.
export class MalformedAnswer extends Error {
  readonly step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
  }
}

// The model steps in domain types. pipeline.ts depends on this type; model.ts implements
// it, and the tests script it.
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
  // V2 gets the claim and the quote and nothing else that Extract wrote.
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
};

export type Effort = "low" | "medium" | "high";

const SONNET = "claude-sonnet-5-5";

// The only file that names a model. Keyed by step, so a new step without an entry fails
// the type check.
export const MODEL_CONFIG: Readonly<
  Record<keyof ModelSteps, { model: string; effort: Effort }>
> = Object.freeze({
  plan: { model: SONNET, effort: "medium" },
  select: { model: SONNET, effort: "low" },
  pickFromMap: { model: SONNET, effort: "low" },
  extract: { model: SONNET, effort: "medium" },
  supports: { model: SONNET, effort: "low" },
  checkGaps: { model: SONNET, effort: "medium" },
  writeReport: { model: SONNET, effort: "medium" },
});
