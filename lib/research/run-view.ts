import { domainOf } from "./domain";
import type {
  BudgetLimits,
  CitationCheck,
  ClaimNumber,
  DecodoEndpoint,
  ModelCall,
  ModelCallOutcome,
  ModelStep,
  ModelTokens,
  PageUrl,
  PlannedQuery,
  Question,
  ReadSkip,
  RoundNo,
  RunEnd,
  RunEvent,
  RunId,
  SearchOutcome,
  SiteUrl,
  SourceLabel,
  WebFailure,
} from "./events";

// A page that a round skips as already read keeps the state of that earlier read.
export type SkipReason =
  | Exclude<ReadSkip, "already-read">
  | "not-chosen"
  | "run-ended";

export type PageState =
  | { kind: "found" }
  | { kind: "queued" }
  | { kind: "skipped"; reason: SkipReason }
  | {
      kind: "read";
      chars: number;
      label: SourceLabel | null;
      extractError: string | null;
    }
  | { kind: "failed"; failure: WebFailure };

export type PageView = {
  url: PageUrl;
  title: string;
  snippet: string | null;
  foundInRound: RoundNo;
  via: "search" | "map";
  state: PageState;
};

export type Source = {
  url: PageUrl;
  title: string;
  domain: string;
  label: SourceLabel;
};

export type VerifiedClaim = {
  number: ClaimNumber;
  statement: string;
  quote: string;
  source: Source;
};

export type DroppedClaim = {
  url: PageUrl;
  statement: string;
  quote: string;
  failed: "V1" | "V2";
  reason: string;
};

export type SearchView = { query: PlannedQuery; outcome: SearchOutcome | null };

export type MapView = {
  site: SiteUrl;
  outcome:
    | { status: "ok"; listed: number; picked: readonly PageUrl[] }
    | { status: "failed"; failure: WebFailure };
};

export type RoundView = {
  no: RoundNo;
  searches: readonly SearchView[];
  droppedQueries: readonly PlannedQuery[];
  unknownNumbers: readonly number[];
  map: MapView | null;
  gap: { answered: boolean; missing: readonly string[] } | null;
};

export type DecodoCall = {
  call: number;
  round: RoundNo;
  endpoint: DecodoEndpoint;
  input: string;
  rendered: boolean;
  outcome: "ok" | "failed" | "open" | "abandoned";
  detail: string | null;
  durationMs: number | null;
};

export type BudgetUsage = {
  limits: BudgetLimits | null;
  rounds: number;
  queriesThisRound: number;
  readsThisRound: number;
  readAttemptsThisRound: number;
  maps: number;
};

export type ModelStepUsage = {
  calls: number;
  outcomes: Readonly<Record<ModelCallOutcome, number>>;
  durationMs: number;
  longestMs: number;
  queuedMs: number;
  longestQueueMs: number;
  // A total stays null while no call reported that count.
  tokens: ModelTokens;
  withoutTokens: number;
};

export type ModelUsage = {
  byStep: Readonly<Partial<Record<ModelStep, ModelStepUsage>>>;
  total: ModelStepUsage;
};

export type ReportView =
  | { kind: "draft"; markdown: string }
  | {
      kind: "final";
      writtenBy: "model" | "code";
      markdown: string;
      cited: readonly ClaimNumber[];
      removedCitations: readonly number[];
    };

export type RunView = {
  runId: RunId;
  question: Question;
  lastSeq: number;
  status: "running" | RunEnd["status"];
  end: RunEnd | null;
  error: { step: string; message: string } | null;
  rounds: readonly RoundView[];
  pages: Readonly<Record<string, PageView>>;
  verified: readonly VerifiedClaim[];
  dropped: readonly DroppedClaim[];
  report: ReportView | null;
  citationCheck: CitationCheck | null;
  budget: BudgetUsage;
  decodoCalls: readonly DecodoCall[];
  model: ModelUsage;
};

const NO_TOKENS: ModelTokens = {
  input: null,
  output: null,
  reasoning: null,
  cacheRead: null,
  cacheWrite: null,
};

const NO_MODEL_CALLS: ModelStepUsage = {
  calls: 0,
  outcomes: { ok: 0, truncated: 0, failed: 0, cancelled: 0 },
  durationMs: 0,
  longestMs: 0,
  queuedMs: 0,
  longestQueueMs: 0,
  tokens: NO_TOKENS,
  withoutTokens: 0,
};

const addCount = (sum: number | null, n: number | null) =>
  n === null ? sum : (sum ?? 0) + n;

function addCall(usage: ModelStepUsage, call: ModelCall): ModelStepUsage {
  const { tokens } = usage;
  return {
    calls: usage.calls + 1,
    outcomes: {
      ...usage.outcomes,
      [call.outcome]: usage.outcomes[call.outcome] + 1,
    },
    durationMs: usage.durationMs + call.durationMs,
    longestMs: Math.max(usage.longestMs, call.durationMs),
    queuedMs: usage.queuedMs + call.queuedMs,
    longestQueueMs: Math.max(usage.longestQueueMs, call.queuedMs),
    tokens: {
      input: addCount(tokens.input, call.tokens.input),
      output: addCount(tokens.output, call.tokens.output),
      reasoning: addCount(tokens.reasoning, call.tokens.reasoning),
      cacheRead: addCount(tokens.cacheRead, call.tokens.cacheRead),
      cacheWrite: addCount(tokens.cacheWrite, call.tokens.cacheWrite),
    },
    withoutTokens:
      usage.withoutTokens +
      (call.tokens.input === null && call.tokens.output === null ? 1 : 0),
  };
}

export function createView(runId: RunId, question: Question): RunView {
  return {
    runId,
    question,
    lastSeq: 0,
    status: "running",
    end: null,
    error: null,
    rounds: [],
    pages: {},
    verified: [],
    dropped: [],
    report: null,
    citationCheck: null,
    budget: {
      limits: null,
      rounds: 0,
      queriesThisRound: 0,
      readsThisRound: 0,
      readAttemptsThisRound: 0,
      maps: 0,
    },
    decodoCalls: [],
    model: { byStep: {}, total: NO_MODEL_CALLS },
  };
}

function hostOf(url: PageUrl): string {
  return new URL(url).hostname;
}

function updateRound(
  view: RunView,
  no: RoundNo,
  update: (round: RoundView) => RoundView,
): readonly RoundView[] {
  if (!view.rounds.some((round) => round.no === no)) {
    throw new Error(`event for round ${no}, which has not started`);
  }
  return view.rounds.map((round) => (round.no === no ? update(round) : round));
}

function pageOf(view: RunView, url: PageUrl): PageView {
  const page = view.pages[url];
  if (!page) throw new Error(`event for unknown page ${url}`);
  return page;
}

function withPage(
  view: RunView,
  url: PageUrl,
  update: (page: PageView) => PageView,
): Readonly<Record<string, PageView>> {
  return { ...view.pages, [url]: update(pageOf(view, url)) };
}

function addFound(
  pages: Record<string, PageView>,
  found: Omit<PageView, "state">,
): void {
  const existing = pages[found.url];
  if (!existing) {
    pages[found.url] = { ...found, state: { kind: "found" } };
  } else if (existing.state.kind === "skipped") {
    pages[found.url] = { ...existing, state: { kind: "found" } };
  }
}

function skipReads(
  view: RunView,
  skipped: readonly { url: PageUrl; reason: ReadSkip }[],
): Record<string, PageView> {
  const pages = { ...view.pages };
  for (const { url, reason } of skipped) {
    if (reason === "already-read") continue;
    pages[url] = { ...pageOf(view, url), state: { kind: "skipped", reason } };
  }
  return pages;
}

function queueReads(
  view: RunView,
  queue: readonly PageUrl[],
  skipped: readonly { url: PageUrl; reason: ReadSkip }[],
): Record<string, PageView> {
  const pages = skipReads(view, skipped);
  for (const url of queue) {
    pages[url] = { ...pageOf(view, url), state: { kind: "queued" } };
  }
  for (const [url, page] of Object.entries(pages)) {
    if (page.state.kind === "found") {
      pages[url] = {
        ...page,
        state: { kind: "skipped", reason: "not-chosen" },
      };
    }
  }
  return pages;
}

export function applyEvent(view: RunView, event: RunEvent): RunView {
  if (event.seq !== view.lastSeq + 1) {
    throw new Error(`event seq ${event.seq} after ${view.lastSeq}`);
  }
  if (view.status !== "running") {
    throw new Error(`event ${event.type} after run.finished`);
  }
  const next = reduce(view, event);
  return { ...next, lastSeq: event.seq };
}

function reduce(view: RunView, event: RunEvent): RunView {
  switch (event.type) {
    case "run.started":
      return { ...view, budget: { ...view.budget, limits: event.limits } };

    case "round.started":
      return {
        ...view,
        rounds: [
          ...view.rounds,
          {
            no: event.round,
            searches: event.queries.map((query) => ({ query, outcome: null })),
            droppedQueries: event.droppedQueries,
            unknownNumbers: [],
            map: null,
            gap: null,
          },
        ],
        budget: {
          ...view.budget,
          rounds: view.budget.rounds + 1,
          queriesThisRound: 0,
          readsThisRound: 0,
          readAttemptsThisRound: 0,
        },
      };

    case "decodo.requested": {
      const budget = { ...view.budget };
      if (event.endpoint === "google_search") budget.queriesThisRound += 1;
      if (event.endpoint === "universal") budget.readAttemptsThisRound += 1;
      if (event.endpoint === "map") budget.maps += 1;
      return {
        ...view,
        budget,
        decodoCalls: [
          ...view.decodoCalls,
          {
            call: event.call,
            round: event.round,
            endpoint: event.endpoint,
            input: event.input,
            rendered: event.rendered === true,
            outcome: "open",
            detail: null,
            durationMs: null,
          },
        ],
      };
    }

    case "decodo.settled":
      return {
        ...view,
        decodoCalls: view.decodoCalls.map((call) =>
          call.call === event.call
            ? {
                ...call,
                outcome: event.outcome,
                detail: event.detail,
                durationMs: event.durationMs,
              }
            : call,
        ),
      };

    case "model.called":
      return {
        ...view,
        model: {
          byStep: {
            ...view.model.byStep,
            [event.step]: addCall(
              view.model.byStep[event.step] ?? NO_MODEL_CALLS,
              event,
            ),
          },
          total: addCall(view.model.total, event),
        },
      };

    case "search.finished": {
      const rounds = updateRound(view, event.round, (round) => {
        let done = false;
        return {
          ...round,
          searches: round.searches.map((search) => {
            if (done || search.outcome !== null) return search;
            if (
              search.query.query !== event.query.query ||
              search.query.subQuestion !== event.query.subQuestion
            ) {
              return search;
            }
            done = true;
            return { ...search, outcome: event.outcome };
          }),
        };
      });
      const pages = { ...view.pages };
      if (event.outcome.status === "ok") {
        for (const result of event.outcome.results) {
          addFound(pages, {
            url: result.url,
            title: result.title,
            snippet: result.snippet,
            foundInRound: event.round,
            via: "search",
          });
        }
      }
      return { ...view, rounds, pages };
    }

    case "select.finished":
      return {
        ...view,
        rounds: updateRound(view, event.round, (round) => ({
          ...round,
          unknownNumbers: [...round.unknownNumbers, ...event.unknownNumbers],
        })),
      };

    case "map.finished": {
      const { outcome } = event;
      const pages = { ...view.pages };
      if (outcome.status === "ok") {
        for (const url of outcome.picked) {
          addFound(pages, {
            url,
            title: hostOf(url) + new URL(url).pathname,
            snippet: null,
            foundInRound: event.round,
            via: "map",
          });
        }
      }
      return {
        ...view,
        pages,
        rounds: updateRound(view, event.round, (round) => ({
          ...round,
          unknownNumbers: [
            ...round.unknownNumbers,
            ...(outcome.status === "ok" ? outcome.unknownNumbers : []),
          ],
          map: {
            site: event.site,
            outcome:
              outcome.status === "ok"
                ? {
                    status: "ok",
                    listed: outcome.listed,
                    picked: outcome.picked,
                  }
                : outcome,
          },
        })),
      };
    }

    case "reads.planned":
      return { ...view, pages: queueReads(view, event.granted, event.refused) };

    case "reads.queued":
      return { ...view, pages: queueReads(view, event.queue, event.skipped) };

    case "reads.finished":
      return { ...view, pages: skipReads(view, event.skipped) };

    case "page.read":
      return {
        ...view,
        budget: {
          ...view.budget,
          readsThisRound: view.budget.readsThisRound + 1,
        },
        pages: withPage(view, event.url, (page) => ({
          ...page,
          title: event.title,
          state: {
            kind: "read",
            chars: event.chars,
            label: null,
            extractError: null,
          },
        })),
      };

    case "page.failed":
      return {
        ...view,
        pages: withPage(view, event.url, (page) => ({
          ...page,
          state: { kind: "failed", failure: event.failure },
        })),
      };

    case "page.extracted":
    case "page.extract-failed":
      return {
        ...view,
        pages: withPage(view, event.url, (page) => {
          if (page.state.kind !== "read") {
            throw new Error(`${event.type} for a page that is not read`);
          }
          return {
            ...page,
            state:
              event.type === "page.extracted"
                ? { ...page.state, label: event.label }
                : { ...page.state, extractError: event.message },
          };
        }),
      };

    case "claim.verified": {
      if (event.number !== view.verified.length + 1) {
        throw new Error(
          `claim number ${event.number} after ${view.verified.length} verified claims`,
        );
      }
      const page = pageOf(view, event.url);
      if (page.state.kind !== "read" || page.state.label === null) {
        throw new Error(
          `verified claim for a page that is not read and labeled`,
        );
      }
      return {
        ...view,
        verified: [
          ...view.verified,
          {
            number: event.number,
            statement: event.statement,
            quote: event.quote,
            source: {
              url: page.url,
              title: page.title,
              domain: domainOf(page.url),
              label: page.state.label,
            },
          },
        ],
      };
    }

    case "claim.dropped":
      return {
        ...view,
        dropped: [
          ...view.dropped,
          {
            url: event.url,
            statement: event.statement,
            quote: event.quote,
            failed: event.failed,
            reason: event.reason,
          },
        ],
      };

    case "gap.checked":
      return {
        ...view,
        rounds: updateRound(view, event.round, (round) => ({
          ...round,
          gap: { answered: event.answered, missing: event.missing },
        })),
      };

    case "run.error":
      return { ...view, error: { step: event.step, message: event.message } };

    case "report.delta":
      return {
        ...view,
        report: {
          kind: "draft",
          markdown:
            (view.report?.kind === "draft" ? view.report.markdown : "") +
            event.text,
        },
      };

    case "report.checked": {
      const { uncited, repairs, rewritten, removed, modelCalls } = event;
      return {
        ...view,
        citationCheck: { uncited, repairs, rewritten, removed, modelCalls },
      };
    }

    case "report.finished":
      return {
        ...view,
        report: {
          kind: "final",
          writtenBy: event.writtenBy,
          markdown: event.markdown,
          cited: event.cited,
          removedCitations: event.removedCitations,
        },
      };

    case "run.finished": {
      const pages: Record<string, PageView> = {};
      for (const [url, page] of Object.entries(view.pages)) {
        pages[url] =
          page.state.kind === "found" || page.state.kind === "queued"
            ? { ...page, state: { kind: "skipped", reason: "run-ended" } }
            : page;
      }
      return {
        ...view,
        status: event.end.status,
        end: event.end,
        pages,
        report:
          event.end.status === "completed" && view.report?.kind === "final"
            ? view.report
            : null,
        decodoCalls: view.decodoCalls.map((call) =>
          call.outcome === "open" ? { ...call, outcome: "abandoned" } : call,
        ),
      };
    }
  }
}

export function replay(view: RunView, events: readonly RunEvent[]): RunView {
  return events.reduce(applyEvent, view);
}

export type Candidate = { url: PageUrl; title: string; snippet: string | null };

export function candidatesOf(view: RunView): readonly Candidate[] {
  return Object.values(view.pages)
    .filter((page) => page.state.kind === "found")
    .map(({ url, title, snippet }) => ({ url, title, snippet }));
}

export function sourcesOf(
  view: RunView,
): readonly { source: Source; claims: readonly ClaimNumber[] }[] {
  const byUrl = new Map<string, { source: Source; claims: ClaimNumber[] }>();
  for (const claim of view.verified) {
    const entry = byUrl.get(claim.source.url);
    if (entry) entry.claims.push(claim.number);
    else
      byUrl.set(claim.source.url, {
        source: claim.source,
        claims: [claim.number],
      });
  }
  return [...byUrl.values()];
}

export function lastGap(view: RunView): RoundView["gap"] {
  for (let i = view.rounds.length - 1; i >= 0; i -= 1) {
    const gap = view.rounds[i]?.gap;
    if (gap) return gap;
  }
  return null;
}

export function subQuestionsOf(view: RunView): readonly string[] {
  const all = view.rounds.flatMap((round) =>
    round.searches.map((search) => search.query.subQuestion),
  );
  return [...new Set(all)];
}
