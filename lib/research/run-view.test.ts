import { describe, expect, it } from "vitest";
import {
  ClaimNumber,
  type ModelCallOutcome,
  type ModelStep,
  type ModelTokens,
  PageUrl,
  type PlannedQuery,
  Question,
  type RunEvent,
  RunEventBody,
  RunId,
} from "./events";
import {
  applyEvent,
  candidatesOf,
  createView,
  type RunView,
  replay,
  sourcesOf,
} from "./run-view";

const url = (n: number) => PageUrl.parse(`https://www.example.org/page-${n}`);
const query: PlannedQuery = { subQuestion: "How long?", query: "lfp life" };
const empty = () => createView(RunId.parse("run-1"), Question.parse("Q?"));

function stamp(bodies: readonly RunEventBody[], from = 1): RunEvent[] {
  return bodies.map((body, i) => ({
    ...body,
    seq: from + i,
    at: "2026-11-15T21:00:00.000Z",
  }));
}

function run(...bodies: RunEventBody[]): RunView {
  return replay(empty(), stamp(bodies));
}

function then(view: RunView, ...bodies: RunEventBody[]): RunView {
  return replay(view, stamp(bodies, view.lastSeq + 1));
}

const found = (...ns: number[]): RunEventBody[] => [
  { type: "round.started", round: 1, queries: [query], droppedQueries: [] },
  {
    type: "search.finished",
    round: 1,
    query,
    outcome: {
      status: "ok",
      results: ns.map((n) => ({
        position: n,
        title: `Title ${n}`,
        url: url(n),
        snippet: `Snippet ${n}`,
      })),
    },
  },
];

const stateOf = (view: RunView, n: number) => view.pages[url(n)]?.state;

describe("page states (F1)", () => {
  it("a search result is found and is a candidate", () => {
    const view = run(...found(1, 2));
    expect(stateOf(view, 1)).toEqual({ kind: "found" });
    expect(candidatesOf(view).map((c) => c.url)).toEqual([url(1), url(2)]);
  });

  it("a stored reads.planned queues the granted, skips the over-budget, and skips the rest as not chosen", () => {
    const view = run(...found(1, 2, 3, 4), {
      type: "reads.planned",
      round: 1,
      granted: [url(1)],
      refused: [
        { url: url(2), reason: "over-budget" },
        { url: url(3), reason: "already-read" },
      ],
    });
    expect([1, 2, 3, 4].map((n) => stateOf(view, n))).toEqual([
      { kind: "queued" },
      { kind: "skipped", reason: "over-budget" },
      { kind: "skipped", reason: "not-chosen" },
      { kind: "skipped", reason: "not-chosen" },
    ]);
    expect(candidatesOf(view)).toEqual([]);
  });

  it("reads.queued queues the ranked pages, skips a refused site, and skips the rest as not chosen", () => {
    const view = run(...found(1, 2, 3, 4), {
      type: "reads.queued",
      round: 1,
      queue: [url(1), url(2)],
      skipped: [{ url: url(3), reason: "site-refused" }],
    });
    expect([1, 2, 3, 4].map((n) => stateOf(view, n))).toEqual([
      { kind: "queued" },
      { kind: "queued" },
      { kind: "skipped", reason: "site-refused" },
      { kind: "skipped", reason: "not-chosen" },
    ]);
  });

  it("reads.finished skips the queued pages that the round did not read", () => {
    const view = run(
      ...found(1, 2, 3),
      {
        type: "reads.queued",
        round: 1,
        queue: [url(1), url(2), url(3)],
        skipped: [],
      },
      { type: "page.read", round: 1, url: url(1), title: "Read", chars: 42 },
      {
        type: "reads.finished",
        round: 1,
        skipped: [
          { url: url(2), reason: "site-refused" },
          { url: url(3), reason: "over-budget" },
        ],
      },
    );
    expect([1, 2, 3].map((n) => stateOf(view, n)?.kind)).toEqual([
      "read",
      "skipped",
      "skipped",
    ]);
    expect(stateOf(view, 2)).toEqual({
      kind: "skipped",
      reason: "site-refused",
    });
    expect(stateOf(view, 3)).toEqual({
      kind: "skipped",
      reason: "over-budget",
    });
  });

  it("keeps the state of a page that a round skips as already read", () => {
    const view = run(
      ...found(1),
      { type: "reads.queued", round: 1, queue: [url(1)], skipped: [] },
      { type: "page.read", round: 1, url: url(1), title: "Read", chars: 42 },
      {
        type: "reads.queued",
        round: 1,
        queue: [],
        skipped: [{ url: url(1), reason: "already-read" }],
      },
    );
    expect(stateOf(view, 1)?.kind).toBe("read");
  });

  it("a read page carries its chars and label, a failed page its failure", () => {
    const view = run(
      ...found(1, 2),
      {
        type: "reads.planned",
        round: 1,
        granted: [url(1), url(2)],
        refused: [],
      },
      { type: "page.read", round: 1, url: url(1), title: "Read", chars: 42 },
      { type: "page.extracted", url: url(1), label: "Paper", drafts: 0 },
      {
        type: "page.failed",
        round: 1,
        url: url(2),
        failure: { kind: "not-text", detail: "PDF" },
      },
    );
    expect(stateOf(view, 1)).toEqual({
      kind: "read",
      chars: 42,
      label: "Paper",
      extractError: null,
    });
    expect(view.pages[url(1)]?.title).toBe("Read");
    expect(stateOf(view, 2)).toEqual({
      kind: "failed",
      failure: { kind: "not-text", detail: "PDF" },
    });
  });

  it("a skipped page that a later search finds again is found", () => {
    const view = run(...found(1), {
      type: "reads.planned",
      round: 1,
      granted: [],
      refused: [],
    });
    expect(stateOf(view, 1)?.kind).toBe("skipped");
    const later = then(
      view,
      { type: "round.started", round: 2, queries: [query], droppedQueries: [] },
      {
        type: "search.finished",
        round: 2,
        query,
        outcome: {
          status: "ok",
          results: [{ position: 1, title: "T", url: url(1), snippet: "" }],
        },
      },
    );
    expect(stateOf(later, 1)).toEqual({ kind: "found" });
  });

  it("run.finished leaves no page found or queued", () => {
    const view = run(...found(1, 2), {
      type: "reads.planned",
      round: 1,
      granted: [url(1)],
      refused: [],
    });
    const done = then(view, {
      type: "run.finished",
      end: { status: "cancelled" },
    });
    expect(Object.values(done.pages).map((p) => p.state)).toEqual([
      { kind: "skipped", reason: "run-ended" },
      { kind: "skipped", reason: "not-chosen" },
    ]);
  });
});

describe("searches (F2)", () => {
  it("keeps a search without results and a failed search", () => {
    const other: PlannedQuery = { subQuestion: "Why?", query: "lfp heat" };
    const view = run(
      {
        type: "round.started",
        round: 1,
        queries: [query, other],
        droppedQueries: [],
      },
      {
        type: "search.finished",
        round: 1,
        query: other,
        outcome: {
          status: "failed",
          failure: { kind: "rejected", detail: "x" },
        },
      },
      {
        type: "search.finished",
        round: 1,
        query,
        outcome: { status: "ok", results: [] },
      },
    );
    expect(view.rounds[0]?.searches).toEqual([
      { query, outcome: { status: "ok", results: [] } },
      {
        query: other,
        outcome: {
          status: "failed",
          failure: { kind: "rejected", detail: "x" },
        },
      },
    ]);
  });
});

describe("claims", () => {
  const readPage: RunEventBody[] = [
    ...found(1),
    { type: "reads.planned", round: 1, granted: [url(1)], refused: [] },
    { type: "page.read", round: 1, url: url(1), title: "LFP", chars: 10 },
    { type: "page.extracted", url: url(1), label: "Reference", drafts: 2 },
  ];
  const verified = (n: number): RunEventBody => ({
    type: "claim.verified",
    number: ClaimNumber.parse(n),
    url: url(1),
    statement: `S${n}`,
    quote: `Q${n}`,
  });

  it("a verified claim resolves its source with title, domain, and label", () => {
    const view = run(...readPage, verified(1));
    expect(view.verified).toEqual([
      {
        number: 1,
        statement: "S1",
        quote: "Q1",
        source: {
          url: url(1),
          title: "LFP",
          domain: "example.org",
          label: "Reference",
        },
      },
    ]);
    expect(sourcesOf(then(view, verified(2)))).toEqual([
      { source: view.verified[0]?.source, claims: [1, 2] },
    ]);
  });

  it("rejects a claim number that is not the next one", () => {
    expect(() => run(...readPage, verified(2))).toThrow();
  });

  it("rejects a verified claim for a page that has no label", () => {
    expect(() => run(...readPage.slice(0, -1), verified(1))).toThrow();
  });

  it("keeps a dropped claim with its quote and the failed check (F3)", () => {
    const view = run(...readPage, {
      type: "claim.dropped",
      url: url(1),
      statement: "S",
      quote: "Q",
      failed: "V1",
      reason: "not-on-page",
    });
    expect(view.dropped).toEqual([
      {
        url: url(1),
        statement: "S",
        quote: "Q",
        failed: "V1",
        reason: "not-on-page",
      },
    ]);
    expect(view.verified).toEqual([]);
  });
});

describe("report (U5)", () => {
  const draft: RunEventBody = { type: "report.delta", text: "Draft" };
  const final: RunEventBody = {
    type: "report.finished",
    writtenBy: "model",
    markdown: "Final",
    cited: [],
    removedCitations: [],
  };

  it("a cancelled run has no report after report.delta events", () => {
    const view = run(draft, {
      type: "run.finished",
      end: { status: "cancelled" },
    });
    expect(view.report).toBeNull();
    expect(view.status).toBe("cancelled");
  });

  it("drafts accumulate while the run is active", () => {
    expect(run(draft, draft).report).toEqual({
      kind: "draft",
      markdown: "DraftDraft",
    });
  });

  it("a completed run keeps the final report", () => {
    const view = run(draft, final, {
      type: "run.finished",
      end: { status: "completed", stoppedBy: "budget" },
    });
    expect(view.report).toMatchObject({ kind: "final", markdown: "Final" });
  });

  it("keeps the citation check of a completed run (#7)", () => {
    const check: RunEventBody = {
      type: "report.checked",
      uncited: [
        { text: "Heat hurts.", opening: false, verdict: "fact", reason: "R" },
      ],
      repairs: [
        {
          sentence: 0,
          action: "delete",
          claims: [],
          unknownClaims: [],
          text: null,
        },
      ],
      rewritten: [],
      removed: [{ text: "Heat hurts.", opening: false, by: "repair" }],
      modelCalls: 2,
    };
    const view = run(draft, check, final, {
      type: "run.finished",
      end: { status: "completed", stoppedBy: "budget" },
    });
    const { type: _, ...stored } = check;
    expect(view.citationCheck).toEqual(stored);
  });

  it("a failed run has no report", () => {
    const view = run(draft, {
      type: "run.finished",
      end: { status: "failed", message: "boom" },
    });
    expect(view.report).toBeNull();
  });
});

describe("Decodo calls and budget use (U4)", () => {
  it("lists every call and marks an unsettled one abandoned at the end", () => {
    const view = run(
      { type: "round.started", round: 1, queries: [query], droppedQueries: [] },
      {
        type: "decodo.requested",
        call: 1,
        round: 1,
        endpoint: "google_search",
        input: "lfp life",
      },
      {
        type: "decodo.requested",
        call: 2,
        round: 1,
        endpoint: "universal",
        input: url(1),
      },
      {
        type: "decodo.settled",
        call: 1,
        outcome: "ok",
        detail: "8 results",
        durationMs: 900,
      },
    );
    expect(view.budget).toMatchObject({
      rounds: 1,
      queriesThisRound: 1,
      readsThisRound: 0,
      readAttemptsThisRound: 1,
      maps: 0,
    });
    expect(view.decodoCalls.map((c) => c.outcome)).toEqual(["ok", "open"]);
    const done = then(view, {
      type: "run.finished",
      end: { status: "cancelled" },
    });
    expect(done.decodoCalls.map((c) => c.outcome)).toEqual(["ok", "abandoned"]);
  });
});

describe("budget limits (B7)", () => {
  it("counts a read page, not a read attempt, as a page read", () => {
    const view = run(
      ...found(1, 2),
      { type: "reads.queued", round: 1, queue: [url(1), url(2)], skipped: [] },
      ...[1, 2].map(
        (n): RunEventBody => ({
          type: "decodo.requested",
          call: n,
          round: 1,
          endpoint: "universal",
          input: url(n),
        }),
      ),
      { type: "page.read", round: 1, url: url(1), title: "Read", chars: 42 },
      {
        type: "page.failed",
        round: 1,
        url: url(2),
        failure: { kind: "rejected", detail: "x" },
      },
    );
    expect(view.budget).toMatchObject({
      readsThisRound: 1,
      readAttemptsThisRound: 2,
    });
  });

  it("gives a run stored before the attempt cap its old cap of 8 attempts", () => {
    const stored = RunEventBody.parse({
      type: "run.started",
      limits: {
        rounds: 3,
        queriesPerRound: 5,
        readsPerRound: 8,
        mapsPerRun: 1,
      },
    });
    expect(run(stored).budget.limits).toEqual({
      rounds: 3,
      queriesPerRound: 5,
      readsPerRound: 8,
      readAttemptsPerRound: 8,
      mapsPerRun: 1,
    });
  });
});

describe("log invariants", () => {
  it("rejects a gap in seq", () => {
    const [event] = stamp([{ type: "run.error", step: "x", message: "y" }], 2);
    if (!event) throw new Error("no event");
    expect(() => applyEvent(empty(), event)).toThrow();
  });

  it("rejects an event after run.finished", () => {
    const view = run({ type: "run.finished", end: { status: "cancelled" } });
    expect(() =>
      then(view, { type: "run.error", step: "x", message: "y" }),
    ).toThrow();
  });
});

describe("model calls (#19)", () => {
  const call = (
    step: ModelStep,
    durationMs: number,
    queuedMs: number,
    tokens: Partial<ModelTokens> | null,
    outcome: ModelCallOutcome = "ok",
  ): RunEventBody => ({
    type: "model.called",
    step,
    outcome,
    queuedMs,
    durationMs,
    tokens: {
      input: null,
      output: null,
      reasoning: null,
      cacheRead: null,
      cacheWrite: null,
      ...tokens,
    },
  });

  it("sums the calls, the time, the queue wait and the tokens per step and for the run", () => {
    const view = run(
      call("plan", 4_000, 0, { input: 300, output: 200 }),
      call("extract", 9_000, 2_500, {
        input: 6_000,
        output: 900,
        cacheRead: 0,
      }),
      call("extract", 7_000, 500, {
        input: 5_000,
        output: 1_100,
        cacheRead: 0,
      }),
      call("extract", 2_000, 0, null, "failed"),
    );
    const extract = view.model.byStep.extract;
    expect(extract).toEqual({
      calls: 3,
      outcomes: { ok: 2, truncated: 0, failed: 1, cancelled: 0 },
      durationMs: 18_000,
      longestMs: 9_000,
      queuedMs: 3_000,
      longestQueueMs: 2_500,
      tokens: {
        input: 11_000,
        output: 2_000,
        reasoning: null,
        cacheRead: 0,
        cacheWrite: null,
      },
      withoutTokens: 1,
    });
    expect(view.model.byStep.select).toBeUndefined();
    expect(view.model.total).toMatchObject({
      calls: 4,
      durationMs: 22_000,
      longestMs: 9_000,
      queuedMs: 3_000,
      tokens: { input: 11_300, output: 2_200, reasoning: null, cacheRead: 0 },
    });
  });

  it("a run stored before model calls were recorded has no model calls", () => {
    const view = run(...found(1), {
      type: "run.finished",
      end: { status: "completed", stoppedBy: "answered" },
    });
    expect(view.model.total.calls).toBe(0);
    expect(view.model.byStep).toEqual({});
  });
});
