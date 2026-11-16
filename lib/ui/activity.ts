import { domainOf } from "@/lib/research/domain";
import type {
  ModelStep,
  PageUrl,
  PlannedQuery,
  ReadSkip,
  RoundNo,
  RunEnd,
  RunEvent,
  SearchOutcome,
  SourceLabel,
  WebFailure,
} from "@/lib/research/events";
import type {
  DroppedClaim,
  RunView,
  SkipReason,
  VerifiedClaim,
} from "@/lib/research/run-view";

/**
 * `stopped`: the run ended while the action was still open, so it has no result.
 * `failed`: the action itself failed, as a search or a page read can.
 */
export type RowState = "running" | "done" | "failed" | "stopped";

type Base = {
  id: string;
  state: RowState;
  startedAt: string | null;
  endedAt: string | null;
  // Measured by the run (`decodo.settled`, `model.called`) where it is, else the time
  // between the events around the action. Null while running and when no event marks it.
  durationMs: number | null;
};

export type PlanRow = Base & {
  kind: "plan";
  round: RoundNo;
  queries: readonly PlannedQuery[];
  droppedQueries: readonly PlannedQuery[];
};

export type SearchRow = Base & {
  kind: "search";
  round: RoundNo;
  query: PlannedQuery;
  outcome: SearchOutcome | null;
};

export type SelectRow = Base & {
  kind: "select";
  round: RoundNo;
  picked: readonly { url: PageUrl; title: string }[];
  unknownNumbers: readonly number[];
  mapRequest: { site: string; need: string } | null;
};

export type MapRow = Base & {
  kind: "map";
  round: RoundNo;
  site: string;
  need: string | null;
  outcome:
    | { status: "ok"; listed: number; picked: readonly PageUrl[] }
    | { status: "failed"; failure: WebFailure }
    | null;
};

export type ReadPhase =
  | "reading"
  | "extracting"
  | "checking"
  | "read"
  | "failed";

export type ReadRow = Base & {
  kind: "read";
  round: RoundNo;
  url: PageUrl;
  title: string;
  domain: string;
  via: "search" | "map";
  // The page came back empty and was read again through a browser.
  rendered: boolean;
  phase: ReadPhase;
  chars: number | null;
  label: SourceLabel | null;
  drafts: number | null;
  extractError: string | null;
  failure: WebFailure | null;
  verified: readonly VerifiedClaim[];
  dropped: readonly DroppedClaim[];
};

export type SkippedPage = {
  url: PageUrl;
  title: string;
  domain: string;
  reason: SkipReason | Extract<ReadSkip, "already-read">;
};

export type SkippedRow = Base & {
  kind: "skipped";
  round: RoundNo;
  pages: readonly SkippedPage[];
};

export type GapRow = Base & {
  kind: "gap";
  round: RoundNo;
  answered: boolean | null;
  missing: readonly string[];
  nextQueries: readonly PlannedQuery[];
};

export type ReportRow = Base & {
  kind: "report";
  phase: "writing" | "checking" | "written";
  writtenBy: "model" | "code" | null;
  chars: number;
  cited: number;
  removedCitations: number;
  check: {
    uncited: number;
    facts: number;
    repaired: number;
    removed: number;
    modelCalls: number;
  } | null;
};

export type ErrorRow = Base & { kind: "error"; step: string; message: string };

export type EndRow = Base & { kind: "end"; end: RunEnd };

export type ActivityRow =
  | PlanRow
  | SearchRow
  | SelectRow
  | MapRow
  | ReadRow
  | SkippedRow
  | GapRow
  | ReportRow
  | ErrorRow
  | EndRow;

/** The rows of one round, or with `round: null` the rows that close the run. */
export type ActivityGroup = {
  id: string;
  round: RoundNo | null;
  rows: readonly ActivityRow[];
};

type RoundAcc = {
  no: RoundNo;
  plan: PlanRow;
  searches: SearchRow[];
  select: SelectRow | null;
  map: MapRow | null;
  reads: ReadRow[];
  explicitSkips: { url: PageUrl; reason: ReadSkip }[];
  gap: GapRow | null;
  searchesDoneAt: string | null;
  readsFinishedAt: string | null;
};

const between = (from: string | null, to: string): number | null =>
  from === null ? null : Math.max(0, Date.parse(to) - Date.parse(from));

function closeRead(row: ReadRow, at: string): void {
  if (row.phase === "extracting" || row.phase === "checking") {
    row.phase = "read";
    row.state = "done";
    row.endedAt = at;
  }
}

/**
 * Every action of a run as rows, in the order the run took them. A pure function of the
 * view and its events: the same input gives the same rows, live or from the store.
 */
export function activityOf(
  view: RunView,
  events: readonly RunEvent[],
): ActivityGroup[] {
  const rounds: RoundAcc[] = [];
  const closing: ActivityRow[] = [];
  const readByUrl = new Map<string, ReadRow>();
  const rowByCall = new Map<number, SearchRow | MapRow | ReadRow>();
  const modelMs = new Map<ModelStep, number>();
  let runStartedAt: string | null = null;
  let previousAt: string | null = null;
  // Assigned inside `startReport`, which the compiler does not follow.
  let report = null as ReportRow | null;
  let failed = false;

  const roundOf = (no: RoundNo) => rounds.find((round) => round.no === no);
  // The model time of a step since it was last taken, or null on a run without model calls.
  const takeModelMs = (...steps: ModelStep[]): number | null => {
    let sum: number | null = null;
    for (const step of steps) {
      const ms = modelMs.get(step);
      if (ms === undefined) continue;
      sum = (sum ?? 0) + ms;
      modelMs.delete(step);
    }
    return sum;
  };
  const titleOf = (url: PageUrl) => view.pages[url]?.title ?? domainOf(url);
  const startReport = (at: string): ReportRow => {
    report ??= {
      id: "report",
      kind: "report",
      state: "running",
      startedAt: previousAt ?? at,
      endedAt: null,
      durationMs: null,
      phase: "writing",
      writtenBy: null,
      chars: 0,
      cited: 0,
      removedCitations: 0,
      check: null,
    };
    if (!closing.includes(report)) closing.push(report);
    return report;
  };

  for (const event of events) {
    const { at } = event;
    switch (event.type) {
      case "run.started":
        runStartedAt = at;
        break;

      case "model.called":
        modelMs.set(
          event.step,
          (modelMs.get(event.step) ?? 0) + event.durationMs,
        );
        if (event.step === "writeReport" && report?.phase === "writing") {
          report.phase = "checking";
        }
        break;

      case "round.started": {
        const first = rounds.length === 0;
        rounds.push({
          no: event.round,
          plan: {
            id: `r${event.round}-plan`,
            kind: "plan",
            round: event.round,
            state: "done",
            // Round 1 is planned by its own model step. A later round takes the
            // queries of the gap check before it, so its plan takes no time.
            startedAt: first ? runStartedAt : at,
            endedAt: at,
            durationMs: first
              ? (takeModelMs("plan") ?? between(runStartedAt, at))
              : null,
            queries: event.queries,
            droppedQueries: event.droppedQueries,
          },
          searches: event.queries.map((query, i) => ({
            id: `r${event.round}-search-${i}`,
            kind: "search",
            round: event.round,
            state: "running",
            startedAt: at,
            endedAt: null,
            durationMs: null,
            query,
            outcome: null,
          })),
          select: null,
          map: null,
          reads: [],
          explicitSkips: [],
          gap: null,
          searchesDoneAt: event.queries.length === 0 ? at : null,
          readsFinishedAt: null,
        });
        break;
      }

      case "decodo.requested": {
        const round = roundOf(event.round);
        if (!round) break;
        if (event.endpoint === "google_search") {
          const row = round.searches.find(
            (search) =>
              search.query.query === event.input &&
              ![...rowByCall.values()].includes(search),
          );
          if (row) {
            row.startedAt = at;
            rowByCall.set(event.call, row);
          }
        } else if (event.endpoint === "map") {
          round.map = {
            id: `r${event.round}-map`,
            kind: "map",
            round: event.round,
            state: "running",
            startedAt: at,
            endedAt: null,
            durationMs: null,
            site: event.input,
            need: round.select?.mapRequest?.need ?? null,
            outcome: null,
          };
          rowByCall.set(event.call, round.map);
        } else {
          const url = event.input as PageUrl;
          let row = readByUrl.get(url);
          if (!row) {
            row = {
              id: `r${event.round}-read-${url}`,
              kind: "read",
              round: event.round,
              state: "running",
              startedAt: at,
              endedAt: null,
              durationMs: null,
              url,
              title: titleOf(url),
              domain: domainOf(url),
              via: view.pages[url]?.via ?? "search",
              rendered: false,
              phase: "reading",
              chars: null,
              label: null,
              drafts: null,
              extractError: null,
              failure: null,
              verified: [],
              dropped: [],
            };
            readByUrl.set(url, row);
            round.reads.push(row);
          }
          if (event.rendered) row.rendered = true;
          rowByCall.set(event.call, row);
        }
        break;
      }

      case "decodo.settled": {
        const row = rowByCall.get(event.call);
        if (row) row.durationMs = (row.durationMs ?? 0) + event.durationMs;
        break;
      }

      case "search.finished": {
        const round = roundOf(event.round);
        const row = round?.searches.find(
          (search) =>
            search.outcome === null &&
            search.query.query === event.query.query &&
            search.query.subQuestion === event.query.subQuestion,
        );
        if (!round || !row) break;
        row.outcome = event.outcome;
        row.state = event.outcome.status === "failed" ? "failed" : "done";
        row.endedAt = at;
        if (round.searches.every((search) => search.outcome !== null)) {
          round.searchesDoneAt = at;
        }
        break;
      }

      case "select.finished": {
        const round = roundOf(event.round);
        if (!round) break;
        round.select = {
          id: `r${event.round}-select`,
          kind: "select",
          round: event.round,
          state: "done",
          startedAt: round.searchesDoneAt,
          endedAt: at,
          durationMs:
            takeModelMs("select") ?? between(round.searchesDoneAt, at),
          picked: event.picked.map((url) => ({ url, title: titleOf(url) })),
          unknownNumbers: event.unknownNumbers,
          mapRequest: event.mapRequest,
        };
        break;
      }

      case "map.finished": {
        const round = roundOf(event.round);
        if (!round) break;
        round.map ??= {
          id: `r${event.round}-map`,
          kind: "map",
          round: event.round,
          state: "running",
          startedAt: at,
          endedAt: null,
          durationMs: null,
          site: event.site,
          need: round.select?.mapRequest?.need ?? null,
          outcome: null,
        };
        const pickMs = takeModelMs("pickFromMap");
        if (pickMs !== null) {
          round.map.durationMs = (round.map.durationMs ?? 0) + pickMs;
        }
        round.map.outcome =
          event.outcome.status === "ok"
            ? {
                status: "ok",
                listed: event.outcome.listed,
                picked: event.outcome.picked,
              }
            : event.outcome;
        round.map.state = event.outcome.status === "ok" ? "done" : "failed";
        round.map.endedAt = at;
        break;
      }

      case "reads.planned":
        roundOf(event.round)?.explicitSkips.push(...event.refused);
        break;

      case "reads.queued":
        roundOf(event.round)?.explicitSkips.push(...event.skipped);
        break;

      case "reads.finished": {
        const round = roundOf(event.round);
        if (!round) break;
        round.explicitSkips.push(...event.skipped);
        round.readsFinishedAt = at;
        for (const row of round.reads) closeRead(row, at);
        break;
      }

      case "page.read": {
        const row = readByUrl.get(event.url);
        if (!row) break;
        row.phase = "extracting";
        row.title = event.title;
        row.chars = event.chars;
        break;
      }

      case "page.failed": {
        const row = readByUrl.get(event.url);
        if (!row) break;
        row.phase = "failed";
        row.state = "failed";
        row.failure = event.failure;
        row.endedAt = at;
        break;
      }

      case "page.extracted": {
        const row = readByUrl.get(event.url);
        if (!row) break;
        row.label = event.label;
        row.drafts = event.drafts;
        row.phase = "checking";
        if (event.drafts === 0) closeRead(row, at);
        break;
      }

      case "page.extract-failed": {
        const row = readByUrl.get(event.url);
        if (!row) break;
        row.extractError = event.message;
        closeRead(row, at);
        break;
      }

      case "claim.verified":
      case "claim.dropped": {
        const row = readByUrl.get(event.url);
        if (!row) break;
        if (event.type === "claim.verified") {
          const claim = view.verified.find((c) => c.number === event.number);
          if (claim) row.verified = [...row.verified, claim];
        } else {
          const { url, statement, quote, failed: check, reason } = event;
          row.dropped = [
            ...row.dropped,
            { url, statement, quote, failed: check, reason },
          ];
        }
        const settled = row.verified.length + row.dropped.length;
        if (row.drafts !== null && settled >= row.drafts) closeRead(row, at);
        break;
      }

      case "gap.checked": {
        const round = roundOf(event.round);
        if (!round) break;
        const from = round.readsFinishedAt ?? round.searchesDoneAt;
        round.gap = {
          id: `r${event.round}-gap`,
          kind: "gap",
          round: event.round,
          state: "done",
          startedAt: from,
          endedAt: at,
          durationMs: takeModelMs("checkGaps") ?? between(from, at),
          answered: event.answered,
          missing: event.missing,
          nextQueries: event.nextQueries,
        };
        break;
      }

      case "run.error":
        failed = true;
        closing.push({
          id: `error-${event.seq}`,
          kind: "error",
          state: "failed",
          startedAt: at,
          endedAt: at,
          durationMs: null,
          step: event.step,
          message: event.message,
        });
        break;

      case "report.delta":
        startReport(at).chars += event.text.length;
        break;

      case "report.checked": {
        const row = startReport(at);
        row.phase = "checking";
        row.check = {
          uncited: event.uncited.length,
          facts: event.uncited.filter((s) => s.verdict === "fact").length,
          repaired: event.repairs.filter(
            (r) => r.action === "cite" || r.action === "rewrite",
          ).length,
          removed: event.removed.length,
          modelCalls: event.modelCalls,
        };
        break;
      }

      case "report.finished": {
        const row = startReport(at);
        row.phase = "written";
        row.state = "done";
        row.writtenBy = event.writtenBy;
        row.chars = event.markdown.length;
        row.cited = event.cited.length;
        row.removedCitations = event.removedCitations.length;
        row.endedAt = at;
        row.durationMs =
          takeModelMs("writeReport", "classifySentences", "repairSentences") ??
          between(row.startedAt, at);
        break;
      }

      case "run.finished":
        closing.push({
          id: "end",
          kind: "end",
          state: event.end.status === "failed" ? "failed" : "done",
          startedAt: at,
          endedAt: at,
          durationMs: between(runStartedAt, at),
          end: event.end,
        });
        break;
    }
    previousAt = at;
  }

  const groups: ActivityGroup[] = rounds.map((round) => ({
    id: `round-${round.no}`,
    round: round.no,
    rows: [
      round.plan,
      ...round.searches,
      ...(round.select ? [round.select] : []),
      ...(round.map ? [round.map] : []),
      ...round.reads,
      ...skippedRow(view, round),
      ...(round.gap ? [round.gap] : []),
    ],
  }));

  if (view.status === "running") {
    const next = nextStep(view, rounds, {
      runStartedAt,
      previousAt,
      failed,
      reportStarted: report !== null,
    });
    if (next?.kind === "report") closing.push(next);
    else if (next) {
      const group = groups.find((g) => g.round === next.round);
      if (group) group.rows = [...group.rows, next];
      else {
        groups.push({
          id: `round-${next.round}`,
          round: next.round,
          rows: [next],
        });
      }
    }
  } else {
    for (const group of groups) {
      for (const row of group.rows) {
        if (row.state === "running") row.state = "stopped";
      }
    }
    for (const row of closing) {
      if (row.state === "running") row.state = "stopped";
    }
  }

  if (closing.length > 0) {
    groups.push({ id: "closing", round: null, rows: closing });
  }
  return groups;
}

function skippedRow(view: RunView, round: RoundAcc): SkippedRow[] {
  const pages = new Map<string, SkippedPage>();
  const add = (url: PageUrl, reason: SkippedPage["reason"]) => {
    if (pages.has(url)) return;
    pages.set(url, {
      url,
      title: view.pages[url]?.title ?? domainOf(url),
      domain: domainOf(url),
      reason,
    });
  };
  for (const { url, reason } of round.explicitSkips) add(url, reason);
  for (const page of Object.values(view.pages)) {
    if (page.foundInRound !== round.no || page.state.kind !== "skipped") {
      continue;
    }
    const { reason } = page.state;
    if (reason === "not-chosen" || reason === "run-ended") {
      add(page.url, reason);
    }
  }
  if (pages.size === 0) return [];
  return [
    {
      id: `r${round.no}-skipped`,
      kind: "skipped",
      round: round.no,
      state: "done",
      startedAt: null,
      endedAt: null,
      durationMs: null,
      pages: [...pages.values()],
    },
  ];
}

// No event marks the start of a model step, so the step a running run is in follows
// from what has finished: the same order the pipeline takes.
function nextStep(
  view: RunView,
  rounds: readonly RoundAcc[],
  seen: {
    runStartedAt: string | null;
    previousAt: string | null;
    failed: boolean;
    reportStarted: boolean;
  },
): PlanRow | SelectRow | GapRow | ReportRow | null {
  if (seen.reportStarted) return null;
  const running = {
    state: "running",
    endedAt: null,
    durationMs: null,
  } as const;
  const writing: ReportRow = {
    ...running,
    id: "report",
    kind: "report",
    startedAt: seen.previousAt,
    phase: "writing",
    writtenBy: null,
    chars: 0,
    cited: 0,
    removedCitations: 0,
    check: null,
  };
  if (seen.failed) return writing;

  const round = rounds.at(-1);
  if (!round) {
    if (seen.runStartedAt === null) return null;
    return {
      ...running,
      id: "r1-plan",
      kind: "plan",
      round: 1,
      startedAt: seen.runStartedAt,
      queries: [],
      droppedQueries: [],
    };
  }
  if (round.searchesDoneAt === null) return null;
  if (round.gap) {
    const { answered, nextQueries } = round.gap;
    return answered || nextQueries.length === 0 ? writing : null;
  }

  const found = round.searches.some(
    (search) =>
      search.outcome?.status === "ok" && search.outcome.results.length > 0,
  );
  const readsOpen = round.select !== null && round.readsFinishedAt === null;
  if (readsOpen) return null;
  if (round.select === null && found) {
    return {
      ...running,
      id: `r${round.no}-select`,
      kind: "select",
      round: round.no,
      startedAt: round.searchesDoneAt,
      picked: [],
      unknownNumbers: [],
      mapRequest: null,
    };
  }
  const limit = view.budget.limits?.rounds;
  if (limit !== undefined && round.no >= limit) return writing;
  return {
    ...running,
    id: `r${round.no}-gap`,
    kind: "gap",
    round: round.no,
    startedAt: round.readsFinishedAt ?? round.searchesDoneAt,
    answered: null,
    missing: [],
    nextQueries: [],
  };
}

/** What a running run is doing right now, in words, or null when nothing is open. */
export function currentAction(groups: readonly ActivityGroup[]): string | null {
  const running = groups
    .flatMap((group) => group.rows)
    .filter((row) => row.state === "running");
  const last = running.at(-1);
  if (!last) return null;
  const count = (kind: ActivityRow["kind"]) =>
    running.filter((row) => row.kind === kind).length;
  switch (last.kind) {
    case "plan":
      return "Planning the searches";
    case "search": {
      const n = count("search");
      return n === 1 ? "Searching the web" : `Running ${n} searches`;
    }
    case "select":
      return "Choosing the pages to read";
    case "map":
      return `Mapping ${last.site.replace(/^https?:\/\//, "")}`;
    case "read": {
      const n = count("read");
      const reading = running.some(
        (row) => row.kind === "read" && row.phase === "reading",
      );
      const pages = n === 1 ? "1 page" : `${n} pages`;
      return reading ? `Reading ${pages}` : `Checking the claims of ${pages}`;
    }
    case "gap":
      return "Checking what is still missing";
    case "report":
      return last.phase === "checking"
        ? "Checking the citations"
        : "Writing the report";
    default:
      return null;
  }
}

export function rowCount(groups: readonly ActivityGroup[]): number {
  return groups.reduce((sum, group) => sum + group.rows.length, 0);
}
