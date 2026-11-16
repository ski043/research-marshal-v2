import {
  type BudgetLimits,
  ClaimNumber,
  type DecodoEndpoint,
  domainOf,
  type PageUrl,
  type PlannedQuery,
  type Question,
  type RoundNo,
  type RunEnd,
  type RunEvent,
  type RunId,
  type SearchOutcome,
  type SiteUrl,
  type SourceLabel,
  type WebFailure,
} from "./events";

export type PageState =
  | { kind: "found" }
  | { kind: "queued" }
  | { kind: "skipped"; reason: "not-chosen" | "over-budget" | "run-ended" }
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
  outcome: "ok" | "failed" | "open" | "abandoned";
  detail: string | null;
  durationMs: number | null;
};

export type BudgetUsage = {
  limits: BudgetLimits | null;
  rounds: number;
  queriesThisRound: number;
  readsThisRound: number;
  maps: number;
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
  budget: BudgetUsage;
  decodoCalls: readonly DecodoCall[];
};

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
    budget: {
      limits: null,
      rounds: 0,
      queriesThisRound: 0,
      readsThisRound: 0,
      maps: 0,
    },
    decodoCalls: [],
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
        },
      };

    case "decodo.requested": {
      const budget = { ...view.budget };
      if (event.endpoint === "google_search") budget.queriesThisRound += 1;
      if (event.endpoint === "universal") budget.readsThisRound += 1;
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

    case "reads.planned": {
      const pages = { ...view.pages };
      for (const url of event.granted) {
        pages[url] = { ...pageOf(view, url), state: { kind: "queued" } };
      }
      for (const { url, reason } of event.refused) {
        if (reason === "over-budget") {
          pages[url] = {
            ...pageOf(view, url),
            state: { kind: "skipped", reason: "over-budget" },
          };
        }
      }
      for (const [url, page] of Object.entries(pages)) {
        if (page.state.kind === "found") {
          pages[url] = {
            ...page,
            state: { kind: "skipped", reason: "not-chosen" },
          };
        }
      }
      return { ...view, pages };
    }

    case "page.read":
      return {
        ...view,
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

export function nextClaimNumber(view: RunView): ClaimNumber {
  return ClaimNumber.parse(view.verified.length + 1);
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
