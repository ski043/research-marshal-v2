import { z } from "zod";

export const Question = z.string().trim().min(1).max(2000).brand<"Question">();
export type Question = z.infer<typeof Question>;

export const RunId = z.string().min(1).brand<"RunId">();
export type RunId = z.infer<typeof RunId>;

export const PageUrl = z
  .url({ protocol: /^https?$/ })
  .transform((value) => {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  })
  .brand<"PageUrl">();
export type PageUrl = z.infer<typeof PageUrl>;

export const SiteUrl = z
  .url({ protocol: /^https?$/ })
  .transform((value) => new URL(value).origin)
  .brand<"SiteUrl">();
export type SiteUrl = z.infer<typeof SiteUrl>;

export function siteOf(url: PageUrl): SiteUrl {
  return SiteUrl.parse(url);
}

export function domainOf(url: PageUrl): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

export const RoundNo = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type RoundNo = z.infer<typeof RoundNo>;

export const ClaimNumber = z.int().positive().brand<"ClaimNumber">();
export type ClaimNumber = z.infer<typeof ClaimNumber>;

export const SourceLabel = z.enum([
  "Paper",
  "Official",
  "Reference",
  "News",
  "Organization",
  "Blog",
  "Forum",
  "Other",
]);
export type SourceLabel = z.infer<typeof SourceLabel>;

export const PlannedQuery = z.object({
  subQuestion: z.string().min(1),
  query: z.string().min(1),
});
export type PlannedQuery = z.infer<typeof PlannedQuery>;

export const WebFailure = z.object({
  kind: z.enum([
    "http-status",
    "not-text",
    "empty",
    "unsupported",
    "timeout",
    "rate-limited",
    "rejected",
    "bad-response",
  ]),
  detail: z.string(),
});
export type WebFailure = z.infer<typeof WebFailure>;

export const SearchResult = z.object({
  position: z.int().positive(),
  title: z.string(),
  url: PageUrl,
  snippet: z.string(),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const SearchOutcome = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), results: z.array(SearchResult) }),
  z.object({ status: z.literal("failed"), failure: WebFailure }),
]);
export type SearchOutcome = z.infer<typeof SearchOutcome>;

export const BudgetLimits = z.object({
  rounds: z.int().positive(),
  queriesPerRound: z.int().positive(),
  readsPerRound: z.int().positive(),
  // A run stored before this limit existed made one attempt per page read.
  readAttemptsPerRound: z.int().positive().default(8),
  mapsPerRun: z.int().positive(),
});
export type BudgetLimits = z.infer<typeof BudgetLimits>;

export const DecodoEndpoint = z.enum(["google_search", "universal", "map"]);
export type DecodoEndpoint = z.infer<typeof DecodoEndpoint>;

export const ReadSkip = z.enum(["over-budget", "already-read", "site-refused"]);
export type ReadSkip = z.infer<typeof ReadSkip>;

const SkippedRead = z.object({ url: PageUrl, reason: ReadSkip });

export const StoppedBy = z.enum(["answered", "budget", "dead-end", "error"]);
export type StoppedBy = z.infer<typeof StoppedBy>;

export const RunEnd = z.discriminatedUnion("status", [
  z.object({ status: z.literal("completed"), stoppedBy: StoppedBy }),
  z.object({ status: z.literal("cancelled") }),
  z.object({ status: z.literal("failed"), message: z.string() }),
]);
export type RunEnd = z.infer<typeof RunEnd>;

// Why a sentence of the report carries no citation (R3, R4, R6).
export const SentenceVerdict = z.enum(["fact", "connective", "scope"]);
export type SentenceVerdict = z.infer<typeof SentenceVerdict>;

export const RepairAction = z.enum(["cite", "rewrite", "delete", "none"]);
export type RepairAction = z.infer<typeof RepairAction>;

const JudgedSentence = z.object({
  text: z.string(),
  opening: z.boolean(),
  verdict: SentenceVerdict,
  reason: z.string(),
});

export const CitationCheck = z.object({
  // Every sentence of the draft without a citation, judged.
  uncited: z.array(JudgedSentence),
  // One entry per factual sentence of `uncited`, by its index there.
  repairs: z.array(
    z.object({
      sentence: z.int().nonnegative(),
      action: RepairAction,
      claims: z.array(ClaimNumber),
      unknownClaims: z.array(z.number()),
      text: z.string().nullable(),
    }),
  ),
  // The sentences of the rewrites without a citation, judged again.
  rewritten: z.array(JudgedSentence),
  removed: z.array(
    z.object({
      text: z.string(),
      opening: z.boolean(),
      by: z.enum(["repair", "check"]),
    }),
  ),
  modelCalls: z.int().nonnegative(),
});
export type CitationCheck = z.infer<typeof CitationCheck>;

const MapEventOutcome = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    listed: z.int().nonnegative(),
    picked: z.array(PageUrl),
    unknownNumbers: z.array(z.number()),
  }),
  z.object({ status: z.literal("failed"), failure: WebFailure }),
]);

export const RunEventBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run.started"), limits: BudgetLimits }),
  z.object({
    type: z.literal("round.started"),
    round: RoundNo,
    queries: z.array(PlannedQuery),
    droppedQueries: z.array(PlannedQuery),
  }),
  z.object({
    type: z.literal("decodo.requested"),
    call: z.int().positive(),
    round: RoundNo,
    endpoint: DecodoEndpoint,
    input: z.string(),
    rendered: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("decodo.settled"),
    call: z.int().positive(),
    outcome: z.enum(["ok", "failed"]),
    detail: z.string().nullable(),
    durationMs: z.int().nonnegative(),
  }),
  z.object({
    type: z.literal("search.finished"),
    round: RoundNo,
    query: PlannedQuery,
    outcome: SearchOutcome,
  }),
  z.object({
    type: z.literal("select.finished"),
    round: RoundNo,
    picked: z.array(PageUrl),
    unknownNumbers: z.array(z.number()),
    mapRequest: z.object({ site: SiteUrl, need: z.string() }).nullable(),
  }),
  z.object({
    type: z.literal("map.finished"),
    round: RoundNo,
    site: SiteUrl,
    outcome: MapEventOutcome,
  }),
  // Only runs stored before B7 have this event. They requested every granted page.
  z.object({
    type: z.literal("reads.planned"),
    round: RoundNo,
    granted: z.array(PageUrl),
    refused: z.array(SkippedRead),
  }),
  z.object({
    type: z.literal("reads.queued"),
    round: RoundNo,
    queue: z.array(PageUrl),
    skipped: z.array(SkippedRead),
  }),
  z.object({
    type: z.literal("reads.finished"),
    round: RoundNo,
    skipped: z.array(SkippedRead),
  }),
  z.object({
    type: z.literal("page.read"),
    round: RoundNo,
    url: PageUrl,
    title: z.string(),
    chars: z.int().nonnegative(),
  }),
  z.object({
    type: z.literal("page.failed"),
    round: RoundNo,
    url: PageUrl,
    failure: WebFailure,
  }),
  z.object({
    type: z.literal("page.extracted"),
    url: PageUrl,
    label: SourceLabel,
    drafts: z.int().nonnegative(),
  }),
  z.object({
    type: z.literal("page.extract-failed"),
    url: PageUrl,
    message: z.string(),
  }),
  z.object({
    type: z.literal("claim.verified"),
    number: ClaimNumber,
    url: PageUrl,
    statement: z.string(),
    quote: z.string(),
  }),
  z.object({
    type: z.literal("claim.dropped"),
    url: PageUrl,
    statement: z.string(),
    quote: z.string(),
    failed: z.enum(["V1", "V2"]),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("gap.checked"),
    round: RoundNo,
    answered: z.boolean(),
    missing: z.array(z.string()),
    nextQueries: z.array(PlannedQuery),
  }),
  z.object({
    type: z.literal("run.error"),
    step: z.string(),
    message: z.string(),
  }),
  z.object({ type: z.literal("report.delta"), text: z.string() }),
  CitationCheck.extend({ type: z.literal("report.checked") }),
  z.object({
    type: z.literal("report.finished"),
    writtenBy: z.enum(["model", "code"]),
    markdown: z.string(),
    cited: z.array(ClaimNumber),
    removedCitations: z.array(z.int()),
  }),
  z.object({ type: z.literal("run.finished"), end: RunEnd }),
]);
export type RunEventBody = z.infer<typeof RunEventBody>;

const Envelope = z.object({ seq: z.int().positive(), at: z.iso.datetime() });

export const RunEvent = RunEventBody.and(Envelope);
export type RunEvent = z.infer<typeof RunEvent>;

export type EmittableEvent = Exclude<
  RunEventBody,
  { type: "run.finished" | "reads.planned" }
>;
export type BudgetEvent = Extract<
  EmittableEvent,
  {
    type:
      | "round.started"
      | "decodo.requested"
      | "decodo.settled"
      | "reads.queued"
      | "reads.finished";
  }
>;
export type PipelineEvent = Exclude<EmittableEvent, BudgetEvent>;
