import {
  type BudgetEvent,
  type BudgetLimits,
  type DecodoEndpoint,
  type PageUrl,
  type PlannedQuery,
  type ReadRefusal,
  RoundNo,
  type SearchOutcome,
  type SiteUrl,
  type WebFailure,
} from "./events";

export const BUDGET = Object.freeze({
  rounds: 3,
  queriesPerRound: 5,
  readsPerRound: 8,
  mapsPerRun: 1,
}) satisfies BudgetLimits;

export type ReadOutcome =
  | { status: "ok"; markdown: string }
  | { status: "failed"; failure: WebFailure };

export type MapOutcome =
  | { status: "ok"; urls: readonly PageUrl[] }
  | { status: "failed"; failure: WebFailure };

export type WebActions = {
  search(query: string): Promise<SearchOutcome>;
  read(url: PageUrl): Promise<ReadOutcome>;
  map(site: SiteUrl, limit: number): Promise<MapOutcome>;
};

export type ReadPlan<T> = {
  granted: readonly { item: T; outcome: Promise<ReadOutcome> }[];
  refused: readonly { item: T; reason: ReadRefusal }[];
};

export type Round = {
  no: RoundNo;
  isLast: boolean;
  searches: readonly { query: PlannedQuery; outcome: Promise<SearchOutcome> }[];
  read<T extends { url: PageUrl }>(wanted: readonly T[]): ReadPlan<T>;
  map(site: SiteUrl, limit: number): Promise<MapOutcome> | null;
};

export type MeteredWeb = {
  openRound(queries: readonly PlannedQuery[]): Round | null;
};

export class RunCancelled extends Error {}

export class FatalRunError extends Error {
  readonly step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
  }
}

type RoundState = { readsLeft: number; closed: boolean };

type Settled = { outcome: "ok" | "failed"; detail: string | null };

function settledSearch(outcome: SearchOutcome): Settled {
  return outcome.status === "ok"
    ? { outcome: "ok", detail: `${outcome.results.length} results` }
    : failedWith(outcome.failure);
}

function settledRead(outcome: ReadOutcome): Settled {
  return outcome.status === "ok"
    ? { outcome: "ok", detail: `${outcome.markdown.length} chars` }
    : failedWith(outcome.failure);
}

function settledMap(outcome: MapOutcome): Settled {
  return outcome.status === "ok"
    ? { outcome: "ok", detail: `${outcome.urls.length} links` }
    : failedWith(outcome.failure);
}

function failedWith(failure: WebFailure): Settled {
  return { outcome: "failed", detail: `${failure.kind}: ${failure.detail}` };
}

function untilAbort(signal: AbortSignal): {
  promise: Promise<never>;
  release(): void;
} {
  let onAbort = () => {};
  const promise = new Promise<never>((_, reject) => {
    onAbort = () => reject(new RunCancelled());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    promise,
    release: () => signal.removeEventListener("abort", onAbort),
  };
}

// The pipeline holds only this handle, so the limits are not checks a caller could skip.
// Counters move synchronously, before any await, so parallel callers cannot overdraw.
export function meterWeb(deps: {
  web: WebActions;
  emit: (event: BudgetEvent) => void;
  signal: AbortSignal;
  now: () => number;
}): MeteredWeb {
  const { web, emit, signal, now } = deps;
  let roundsOpened = 0;
  let mapsUsed = 0;
  let callNo = 0;
  const requestedUrls = new Set<PageUrl>();
  let current: RoundState | null = null;

  function call<T>(
    round: RoundNo,
    endpoint: DecodoEndpoint,
    input: string,
    run: () => Promise<T>,
    describe: (outcome: T) => Settled,
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(new RunCancelled());
    const call = ++callNo;
    const startedAt = now();
    emit({ type: "decodo.requested", call, round, endpoint, input });
    const durationMs = () => Math.max(0, Math.round(now() - startedAt));
    const settled = run().then(
      (outcome) => {
        emit({
          type: "decodo.settled",
          call,
          durationMs: durationMs(),
          ...describe(outcome),
        });
        return outcome;
      },
      (error: unknown) => {
        emit({
          type: "decodo.settled",
          call,
          outcome: "failed",
          detail: error instanceof Error ? error.message : String(error),
          durationMs: durationMs(),
        });
        throw error;
      },
    );
    // Decodo takes no signal. After an abort the race rejects at once, and the real call
    // settles later into a sealed log.
    const abort = untilAbort(signal);
    return Promise.race([settled, abort.promise]).finally(abort.release);
  }

  return {
    openRound(queries) {
      if (signal.aborted) throw new RunCancelled();
      if (roundsOpened >= BUDGET.rounds) return null;
      if (current) current.closed = true;
      roundsOpened += 1;
      const no = RoundNo.parse(roundsOpened);
      const granted = queries.slice(0, BUDGET.queriesPerRound);
      emit({
        type: "round.started",
        round: no,
        queries: [...granted],
        droppedQueries: queries.slice(granted.length),
      });
      const state: RoundState = {
        readsLeft: BUDGET.readsPerRound,
        closed: false,
      };
      current = state;

      const assertOpen = () => {
        if (state.closed) throw new Error(`round ${no} is closed`);
      };

      return {
        no,
        isLast: no === BUDGET.rounds,
        searches: granted.map((query) => ({
          query,
          outcome: call(
            no,
            "google_search",
            query.query,
            () => web.search(query.query),
            settledSearch,
          ),
        })),
        read<T extends { url: PageUrl }>(wanted: readonly T[]): ReadPlan<T> {
          assertOpen();
          const chosen: T[] = [];
          const refused: { item: T; reason: ReadRefusal }[] = [];
          for (const item of wanted) {
            if (requestedUrls.has(item.url)) {
              refused.push({ item, reason: "already-read" });
            } else if (state.readsLeft === 0) {
              refused.push({ item, reason: "over-budget" });
            } else {
              state.readsLeft -= 1;
              requestedUrls.add(item.url);
              chosen.push(item);
            }
          }
          emit({
            type: "reads.planned",
            round: no,
            granted: chosen.map((item) => item.url),
            refused: refused.map((r) => ({
              url: r.item.url,
              reason: r.reason,
            })),
          });
          const granted = chosen.map((item) => ({
            item,
            outcome: call(
              no,
              "universal",
              item.url,
              () => web.read(item.url),
              settledRead,
            ),
          }));
          return { granted, refused };
        },
        map(site, limit) {
          assertOpen();
          if (mapsUsed >= BUDGET.mapsPerRun) return null;
          mapsUsed += 1;
          return call(no, "map", site, () => web.map(site, limit), settledMap);
        },
      };
    },
  };
}
