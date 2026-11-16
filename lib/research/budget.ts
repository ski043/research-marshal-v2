import {
  type BudgetEvent,
  type BudgetLimits,
  type DecodoEndpoint,
  type PageUrl,
  type PlannedQuery,
  type ReadSkip,
  RoundNo,
  type SearchOutcome,
  type SiteUrl,
  type WebFailure,
} from "./events";

export const BUDGET = Object.freeze({
  rounds: 3,
  queriesPerRound: 5,
  readsPerRound: 8,
  readAttemptsPerRound: 16,
  mapsPerRun: 1,
}) satisfies BudgetLimits;

export type ReadOutcome =
  | { status: "ok"; markdown: string }
  | { status: "failed"; failure: WebFailure };

export type MapOutcome =
  | { status: "ok"; urls: readonly PageUrl[] }
  | { status: "failed"; failure: WebFailure };

export type ReadMode = "plain" | "rendered";

export type WebActions = {
  search(query: string): Promise<SearchOutcome>;
  read(url: PageUrl, mode?: ReadMode): Promise<ReadOutcome>;
  map(site: SiteUrl, limit: number): Promise<MapOutcome>;
};

export type Round = {
  no: RoundNo;
  isLast: boolean;
  searches: readonly { query: PlannedQuery; outcome: Promise<SearchOutcome> }[];
  /**
   * Reads the ranked pages in order, in parallel, until the round has read
   * `readsPerRound` pages, has used `readAttemptsPerRound` attempts, or has no
   * page left. A failed read starts the next page. `onRead` gets every page
   * that the round requested, with its final outcome.
   */
  read<T extends { url: PageUrl }>(
    ranked: readonly T[],
    onRead: (item: T, outcome: ReadOutcome) => Promise<void>,
  ): Promise<void>;
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

type RoundState = {
  reads: number;
  readsOpen: number;
  attempts: number;
  closed: boolean;
};

type SkippedRead = { url: PageUrl; reason: ReadSkip };

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
    // Decodo takes no signal.
    const abort = untilAbort(signal);
    return Promise.race([settled, abort.promise]).finally(abort.release);
  }

  async function drainReads<T extends { url: PageUrl }>(
    round: RoundNo,
    state: RoundState,
    queue: readonly T[],
    onRead: (item: T, outcome: ReadOutcome) => Promise<void>,
  ): Promise<void> {
    const tasks: Promise<void>[] = [];
    let next = 0;
    let stopped = false;

    const hasRoom = () =>
      state.reads + state.readsOpen < BUDGET.readsPerRound &&
      state.attempts < BUDGET.readAttemptsPerRound;

    const attempt = (url: PageUrl): Promise<ReadOutcome> => {
      state.attempts += 1;
      return call(
        round,
        "universal",
        url,
        () => web.read(url, "plain"),
        settledRead,
      );
    };

    const readOne = async (item: T): Promise<void> => {
      requestedUrls.add(item.url);
      state.readsOpen += 1;
      let outcome: ReadOutcome;
      try {
        outcome = await attempt(item.url);
      } catch (error) {
        state.readsOpen -= 1;
        stopped = true;
        throw error;
      }
      state.readsOpen -= 1;
      if (outcome.status === "ok") state.reads += 1;
      fill();
      try {
        await onRead(item, outcome);
      } catch (error) {
        stopped = true;
        throw error;
      }
    };

    function fill(): void {
      while (!stopped && hasRoom()) {
        const item = queue[next];
        if (item === undefined) return;
        next += 1;
        tasks.push(readOne(item));
      }
    }

    fill();
    const errors: unknown[] = [];
    // A settling read can push the read that replaces it, so the list grows.
    for (let i = 0; i < tasks.length; i += 1) {
      await tasks[i]?.catch((error: unknown) => errors.push(error));
    }
    if (errors.length > 0) throw errors[0];
    emit({
      type: "reads.finished",
      round,
      skipped: queue
        .slice(next)
        .map((item) => ({ url: item.url, reason: "over-budget" })),
    });
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
        reads: 0,
        readsOpen: 0,
        attempts: 0,
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
        read(ranked, onRead) {
          assertOpen();
          const queue: (typeof ranked)[number][] = [];
          const skipped: SkippedRead[] = [];
          const queued = new Set<PageUrl>();
          for (const item of ranked) {
            if (requestedUrls.has(item.url) || queued.has(item.url)) {
              skipped.push({ url: item.url, reason: "already-read" });
            } else {
              queued.add(item.url);
              queue.push(item);
            }
          }
          emit({
            type: "reads.queued",
            round: no,
            queue: queue.map((item) => item.url),
            skipped,
          });
          return drainReads(no, state, queue, onRead);
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
