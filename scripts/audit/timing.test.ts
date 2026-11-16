import { describe, expect, it } from "vitest";
import type { Envelope, StoredRun } from "./stored-run";
import { syntheticRun } from "./synthetic";
import { renderTiming, timeRun, timingCheck } from "./timing";

const LIMITS = {
  wallMsByRounds: { "1": 30_000 },
  readParallelismMin: 1.8,
  readParallelismMinPages: 2,
  modelStepMsMax: {
    plan: 10_000,
    select: 10_000,
    gapCheck: 10_000,
    report: 15_000,
  },
};

// Gives each event type a time in ms from the start, so phases are known exactly.
function timed(
  run: StoredRun,
  at: (e: Envelope, i: number) => number,
): StoredRun {
  return { ...run, events: run.events.map((e, i) => ({ ...e, at: at(e, i) })) };
}

describe("the run timing", () => {
  const parallel = timed(syntheticRun(), (e, i) => {
    const t: Record<string, number> = {
      "run.started": 0,
      "round.started": 2_000,
      "search.finished": 5_000,
      "select.finished": 6_000,
      "reads.planned": 6_000,
      "gap.checked": 18_000,
      "report.delta": 19_000,
      "report.finished": 25_000,
      "run.finished": 25_000,
    };
    if (e.type in t) return t[e.type] as number;
    // Both pages run from 6 s to 16 s side by side.
    if (e.type.startsWith("page.") || e.type.startsWith("claim."))
      return 16_000;
    return 2_000 + i;
  });

  it("splits the wall time into plan, search, select, reads, gap check and report", () => {
    const t = timeRun(parallel);
    expect(t.wallMs).toBe(25_000);
    expect(t.planMs).toBe(2_000);
    expect(t.rounds).toEqual([
      expect.objectContaining({
        round: 1,
        totalMs: 16_000,
        searchMs: 3_000,
        selectMs: 1_000,
        readMs: 10_000,
        gapCheckMs: 2_000,
        pages: 2,
        chainSumMs: 20_000,
        readParallelism: 2,
      }),
    ]);
    expect(t.report).toEqual({
      firstTokenMs: 1_000,
      streamMs: 6_000,
      totalMs: 7_000,
    });
  });

  it("passes inside the thresholds and warns with numbers outside them", () => {
    expect(timingCheck(timeRun(parallel), LIMITS, "COMPLETED").status).toBe(
      "pass",
    );
    // Page A now ends at 11 s: chains of 5 s and 10 s in a 10 s phase.
    const sequential = timed(parallel, (e) =>
      (e as Envelope & { url?: string }).url?.endsWith("/a") ? 11_000 : e.at,
    );
    const check = timingCheck(
      timeRun(sequential),
      { ...LIMITS, readParallelismMin: 1.6 },
      "COMPLETED",
    );
    expect(timeRun(sequential).rounds[0]?.readParallelism).toBeCloseTo(1.5);
    expect(check.status).toBe("warn");
    expect(check.evidence[1]).toBe(
      "over threshold: round 1 read parallelism 1.50 under 1.6",
    );
  });

  it("skips a run that did not complete", () => {
    expect(timingCheck(timeRun(parallel), LIMITS, "CANCELLED").status).toBe(
      "skip",
    );
  });
});

describe("measured model calls (#19)", () => {
  const call = (
    step: string,
    durationMs: number,
    queuedMs: number,
    input: number | null,
    output: number | null,
  ) => ({
    type: "model.called",
    step,
    outcome: input === null ? "failed" : "ok",
    queuedMs,
    durationMs,
    tokens: { input, output, reasoning: null, cacheRead: 0, cacheWrite: null },
  });
  const withCalls = syntheticRun({
    edit: (bodies) => [
      bodies[0] as (typeof bodies)[number],
      call("plan", 4_000, 0, 300, 200),
      ...bodies.slice(1),
      call("extract", 9_000, 2_500, 6_000, 900),
      call("extract", 7_000, 500, 5_000, 1_100),
      call("supports", 1_000, 27_000, null, null),
    ],
  });

  it("sums the measured time, the queue wait and the tokens per step", () => {
    const { model } = timeRun(withCalls);
    expect(model).toEqual({
      calls: 4,
      sumMs: 21_000,
      queuedMs: 30_000,
      longestQueueMs: 27_000,
      steps: [
        {
          step: "plan",
          calls: 1,
          sumMs: 4_000,
          longestMs: 4_000,
          queuedMs: 0,
          inputTokens: 300,
          outputTokens: 200,
        },
        {
          step: "extract",
          calls: 2,
          sumMs: 16_000,
          longestMs: 9_000,
          queuedMs: 3_000,
          inputTokens: 11_000,
          outputTokens: 2_000,
        },
        {
          step: "supports",
          calls: 1,
          sumMs: 1_000,
          longestMs: 1_000,
          queuedMs: 27_000,
          inputTokens: null,
          outputTokens: null,
        },
      ],
    });
    const text = renderTiming(timeRun(withCalls));
    expect(text).toContain(
      "Model 4 calls measured, 21.0 s summed; queue wait 30.0 s summed, longest 27.0 s",
    );
    expect(text).toMatch(
      /extract\s+2\s+16\.0 s\s+9\.0 s\s+3\.0 s\s+11,000\s+2,000/,
    );
    expect(text).not.toContain("are gaps between events, not measured calls");
  });

  it("falls back to the gaps for a run stored before model calls were recorded", () => {
    const old = timeRun(syntheticRun());
    expect(old.model).toBeNull();
    expect(renderTiming(old)).toContain(
      "Model steps (plan, select, gap, report) are gaps between events, not measured calls.",
    );
  });
});
