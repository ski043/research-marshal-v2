import { type Check, plural } from "./checks";
import { type Envelope, eventsOf, type StoredRun } from "./stored-run";

// Model steps have no start or end event. Their durations here are gaps between the
// neighbouring events, so they include waits for a free model slot.

export type RoundTiming = {
  round: number;
  totalMs: number;
  searchMs: number;
  selectMs: number | null;
  mapMs: number | null;
  readMs: number | null;
  gapCheckMs: number | null;
  pages: number;
  chainSumMs: number;
  readParallelism: number | null;
  fetchSumMs: number;
};

export type RunTiming = {
  wallMs: number;
  planMs: number | null;
  rounds: RoundTiming[];
  report: {
    firstTokenMs: number | null;
    streamMs: number | null;
    totalMs: number;
  } | null;
  decodo: { calls: number; sumMs: number };
  slowestCalls: {
    call: number;
    round: number;
    endpoint: string;
    outcome: string;
    durationMs: number | null;
    input: string;
  }[];
};

const PAGE_EVENTS = new Set([
  "page.read",
  "page.failed",
  "page.extracted",
  "page.extract-failed",
  "claim.verified",
  "claim.dropped",
]);

const maxAt = (events: readonly Envelope[], floor: number) =>
  events.reduce((m, e) => Math.max(m, e.at), floor);

export function timeRun(stored: StoredRun): RunTiming {
  const started = eventsOf(stored, "run.started")[0];
  const finished = eventsOf(stored, "run.finished")[0];
  const last = stored.events.at(-1);
  if (!started || !last) throw new Error("the run has no events");
  const t0 = started.at;
  const end = (finished ?? last).at;

  const requested = eventsOf(stored, "decodo.requested");
  const settled = new Map(
    eventsOf(stored, "decodo.settled").map((s) => [s.call, s]),
  );
  const roundStarts = eventsOf(stored, "round.started");

  const rounds: RoundTiming[] = roundStarts.map((start) => {
    const r = start.round;
    const inRound = (e: Envelope & { round?: number }) => e.round === r;
    const searches = eventsOf(stored, "search.finished").filter(inRound);
    const searchEnd = maxAt(searches, start.at);
    const select = eventsOf(stored, "select.finished").find(inRound);
    const map = eventsOf(stored, "map.finished").find(inRound);
    const planned = eventsOf(stored, "reads.planned").find(inRound);
    const gap = eventsOf(stored, "gap.checked").find(inRound);

    let readEnd: number | null = null;
    let chainSumMs = 0;
    const pages = planned?.granted.length ?? 0;
    if (planned) {
      const granted = new Set(planned.granted);
      readEnd = planned.at;
      for (const url of granted) {
        const own = stored.events.filter(
          (e) =>
            PAGE_EVENTS.has(e.type) &&
            (e as Envelope & { url?: string }).url === url,
        );
        const chainEnd = maxAt(own, planned.at);
        chainSumMs += chainEnd - planned.at;
        readEnd = Math.max(readEnd, chainEnd);
      }
    }
    const readMs = planned && readEnd !== null ? readEnd - planned.at : null;
    const fetchSumMs = requested
      .filter((q) => q.round === r && q.endpoint === "universal")
      .reduce((sum, q) => sum + (settled.get(q.call)?.durationMs ?? 0), 0);
    const beforeGap = readEnd ?? map?.at ?? select?.at ?? searchEnd;
    const next = roundStarts.find((s) => s.round === r + 1);
    const roundEnd = gap?.at ?? next?.at ?? beforeGap;
    return {
      round: r,
      totalMs: roundEnd - start.at,
      searchMs: searchEnd - start.at,
      selectMs: select ? select.at - searchEnd : null,
      mapMs: map && select ? map.at - select.at : null,
      readMs,
      gapCheckMs: gap ? gap.at - beforeGap : null,
      pages,
      chainSumMs,
      readParallelism: readMs && readMs > 0 ? chainSumMs / readMs : null,
      fetchSumMs,
    };
  });

  const reportDone = eventsOf(stored, "report.finished")[0];
  const firstDelta = eventsOf(stored, "report.delta")[0];
  const lastStart = roundStarts.at(-1);
  const reportStart = lastStart
    ? lastStart.at + (rounds.at(-1)?.totalMs ?? 0)
    : t0;
  const report = reportDone
    ? {
        firstTokenMs: firstDelta ? firstDelta.at - reportStart : null,
        streamMs: firstDelta ? reportDone.at - firstDelta.at : null,
        totalMs: reportDone.at - reportStart,
      }
    : null;

  const calls = requested.map((q) => {
    const s = settled.get(q.call);
    return {
      call: q.call,
      round: q.round,
      endpoint: q.endpoint,
      outcome: s?.outcome ?? "open",
      durationMs: s ? s.durationMs : null,
      input: q.input,
    };
  });
  return {
    wallMs: end - t0,
    planMs: roundStarts[0] ? roundStarts[0].at - t0 : null,
    rounds,
    report,
    decodo: {
      calls: calls.length,
      sumMs: calls.reduce((n, c) => n + (c.durationMs ?? 0), 0),
    },
    slowestCalls: [...calls]
      .sort((a, b) => (b.durationMs ?? -1) - (a.durationMs ?? -1))
      .slice(0, 5),
  };
}

const s = (ms: number | null) =>
  ms === null ? "-" : `${(ms / 1000).toFixed(1)} s`;

export function renderTiming(t: RunTiming): string {
  const lines = [
    `  Wall time ${s(t.wallMs)}; plan (model) ${s(t.planMs)}; Decodo ${t.decodo.calls} calls, ${s(t.decodo.sumMs)} summed`,
    "  Round  total    search   select   map      reads    gap      pages  parallelism",
  ];
  for (const r of t.rounds) {
    lines.push(
      `  ${String(r.round).padEnd(5)}  ${[
        r.totalMs,
        r.searchMs,
        r.selectMs,
        r.mapMs,
        r.readMs,
        r.gapCheckMs,
      ]
        .map((ms) => s(ms).padEnd(7))
        .join(
          "  ",
        )}  ${String(r.pages).padEnd(5)}  ${r.readParallelism === null ? "-" : r.readParallelism.toFixed(2)}`,
    );
  }
  if (t.report) {
    lines.push(
      `  Report: first delta ${s(t.report.firstTokenMs)}, streaming ${s(t.report.streamMs)}, total ${s(t.report.totalMs)}`,
    );
  }
  lines.push("  Slowest Decodo calls:");
  for (const c of t.slowestCalls) {
    lines.push(
      `    #${c.call} r${c.round} ${c.endpoint} ${c.durationMs === null ? "never settled" : `${c.outcome} ${s(c.durationMs)}`} ${c.input.slice(0, 80)}`,
    );
  }
  lines.push(
    "  Model steps (plan, select, gap, report) are gaps between events, not measured calls.",
    "  Parallelism = sum of page chains (fetch, extract, V2) / wall time of the read phase; 1.0 is sequential.",
  );
  return lines.join("\n");
}

export type RunThresholds = {
  wallMsByRounds: Record<string, number>;
  readParallelismMin: number;
  readParallelismMinPages: number;
  modelStepMsMax: {
    plan: number;
    select: number;
    gapCheck: number;
    report: number;
  };
};

export function timingCheck(
  t: RunTiming,
  limits: RunThresholds,
  runStatus: string,
): Check {
  const spec = {
    id: "perf.run",
    requirement: "-",
    measures:
      "Timing of this one run against verify/perf-thresholds.json. One run is one sample: a miss is a warning with numbers, never proof of a regression.",
  };
  if (runStatus !== "COMPLETED") {
    return {
      ...spec,
      status: "skip",
      evidence: [
        `the run is ${runStatus}; its times are not comparable with a full run`,
      ],
    };
  }
  const misses: string[] = [];
  const ceiling = limits.wallMsByRounds[String(t.rounds.length)];
  if (ceiling !== undefined && t.wallMs > ceiling) {
    misses.push(
      `wall ${s(t.wallMs)} over ${s(ceiling)} for ${t.rounds.length} rounds`,
    );
  }
  const step = (name: string, ms: number | null, max: number) => {
    if (ms !== null && ms > max) misses.push(`${name} ${s(ms)} over ${s(max)}`);
  };
  step("plan", t.planMs, limits.modelStepMsMax.plan);
  for (const r of t.rounds) {
    step(`round ${r.round} select`, r.selectMs, limits.modelStepMsMax.select);
    step(
      `round ${r.round} gap check`,
      r.gapCheckMs,
      limits.modelStepMsMax.gapCheck,
    );
    if (
      r.pages >= limits.readParallelismMinPages &&
      r.readParallelism !== null &&
      r.readParallelism < limits.readParallelismMin
    ) {
      misses.push(
        `round ${r.round} read parallelism ${r.readParallelism.toFixed(2)} under ${limits.readParallelismMin}`,
      );
    }
  }
  if (t.report) step("report", t.report.totalMs, limits.modelStepMsMax.report);
  return {
    ...spec,
    status: misses.length > 0 ? "warn" : "pass",
    evidence: [
      `wall ${s(t.wallMs)}, ${plural(t.rounds.length, "round")}, read parallelism ${t.rounds.map((r) => r.readParallelism?.toFixed(2) ?? "-").join(" / ")}`,
      ...misses.map((m) => `over threshold: ${m}`),
    ],
  };
}
