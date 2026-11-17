import { describe, expect, it } from "vitest";
import { BUDGET } from "@/lib/research/budget";
import {
  PageUrl,
  Question,
  type RunEvent,
  type RunEventBody,
  RunId,
} from "@/lib/research/events";
import { SCENARIOS } from "@/lib/research/offline";
import { runPipeline } from "@/lib/research/pipeline";
import { createView, replay } from "@/lib/research/run-view";
import { testRun } from "@/lib/research/testing";
import {
  type ActivityGroup,
  type ActivityRow,
  activityOf,
  currentAction,
  rowCount,
} from "./activity";

async function eventsOf(name: string): Promise<RunEvent[]> {
  const scenario = SCENARIOS.get(name);
  if (!scenario) throw new Error(`no scenario ${name}`);
  const run = testRun({ model: scenario.model, web: scenario.web });
  await runPipeline(run.deps);
  return run.events;
}

function activity(events: readonly RunEvent[]): ActivityGroup[] {
  const view = replay(
    createView(RunId.parse("test-run"), Question.parse("A question")),
    events,
  );
  return activityOf(view, events);
}

const rowsOf = (groups: readonly ActivityGroup[]) =>
  groups.flatMap((group) => group.rows);

function only<K extends ActivityRow["kind"]>(
  groups: readonly ActivityGroup[],
  kind: K,
): Extract<ActivityRow, { kind: K }>[] {
  return rowsOf(groups).filter(
    (row): row is Extract<ActivityRow, { kind: K }> => row.kind === kind,
  );
}

// The events up to and including the first one that matches.
function upTo(
  events: readonly RunEvent[],
  match: (event: RunEvent) => boolean,
): RunEvent[] {
  const index = events.findIndex(match);
  if (index === -1) throw new Error("no event matches");
  return events.slice(0, index + 1);
}

function then(events: readonly RunEvent[], body: RunEventBody): RunEvent[] {
  const last = events.at(-1);
  return [
    ...events,
    {
      ...body,
      seq: (last?.seq ?? 0) + 1,
      at: "2026-11-15T21:00:05.000Z",
    } as RunEvent,
  ];
}

describe("activityOf on a finished run", () => {
  it("lists the failures run with every failure on its own row (F1, F2)", async () => {
    const groups = activity(await eventsOf("failures"));

    expect(groups.map((group) => group.id)).toEqual(["round-1", "closing"]);
    expect(rowsOf(groups).map((row) => row.kind)).toEqual([
      "plan",
      "search",
      "search",
      "search",
      "select",
      "read",
      "read",
      "skipped",
      "gap",
      "report",
      "end",
    ]);

    const searches = only(groups, "search");
    expect(searches.map((row) => [row.query.query, row.state])).toEqual([
      ["lfp cycle life", "done"],
      ["lfp obscure term", "done"],
      ["lfp aging heat", "failed"],
    ]);
    // The test clock gives every web call a measured time above zero.
    for (const row of searches) expect(row.durationMs).toBeGreaterThan(0);
    expect(searches[1]?.outcome).toEqual({ status: "ok", results: [] });
    expect(searches[2]?.outcome).toMatchObject({
      status: "failed",
      failure: { kind: "timeout" },
    });

    const reads = only(groups, "read");
    expect(reads.map((row) => [row.url, row.phase, row.state])).toEqual([
      ["https://example.org/lfp-cycle-life/1", "read", "done"],
      ["https://example.org/lfp-cycle-life/2", "failed", "failed"],
    ]);
    expect(reads[0]).toMatchObject({ label: "Reference", chars: 76 });
    expect(reads[0]?.verified.map((claim) => claim.number)).toEqual([1]);
    expect(reads[1]?.failure).toEqual({
      kind: "http-status",
      detail: "HTTP 404",
    });

    expect(only(groups, "skipped")[0]?.pages).toEqual([
      {
        url: "https://example.org/lfp-cycle-life/3",
        title: "lfp cycle life result 3",
        domain: "example.org",
        reason: "not-chosen",
      },
    ]);
    expect(only(groups, "end")[0]?.end).toEqual({
      status: "completed",
      stoppedBy: "answered",
    });
  });

  it("puts both kinds of dropped claim under the page they came from (F3)", async () => {
    const [read] = only(activity(await eventsOf("dropped")), "read");

    expect(read?.verified.map((claim) => claim.statement)).toEqual([
      "LFP cells last about 3,000 cycles.",
    ]);
    expect(
      read?.dropped.map((claim) => [claim.failed, claim.statement]),
    ).toEqual([
      ["V1", "LFP cells last about 5,000 cycles."],
      ["V2", "Heat makes LFP cells last longer."],
    ]);
    expect(read?.dropped[1]?.reason).toBe("The quote says heat shortens life.");
    expect(read).toMatchObject({ drafts: 3, phase: "read", state: "done" });
  });

  it("shows the budget run round by round with what the budget cut", async () => {
    const groups = activity(await eventsOf("budget"));

    expect(groups.map((group) => group.id)).toEqual([
      "round-1",
      "round-2",
      "round-3",
      "closing",
    ]);
    const [plan] = only(groups, "plan");
    expect(plan?.queries).toHaveLength(BUDGET.queriesPerRound);
    expect(plan?.droppedQueries.map((query) => query.query)).toEqual([
      "lfp plan 6",
    ]);
    for (const group of groups.slice(0, 3)) {
      const reads = group.rows.filter((row) => row.kind === "read");
      expect(reads).toHaveLength(BUDGET.readsPerRound);
    }
    const maps = only(groups, "map");
    expect(maps).toHaveLength(1);
    expect(maps[0]).toMatchObject({
      round: 1,
      state: "done",
      need: "the datasheet",
      outcome: { status: "ok", listed: 3 },
    });
    const overBudget = only(groups, "skipped")
      .flatMap((row) => row.pages)
      .filter((page) => page.reason === "over-budget");
    expect(overBudget.length).toBeGreaterThan(0);
    expect(only(groups, "gap").map((row) => row.answered)).toEqual([
      false,
      false,
    ]);
    expect(only(groups, "end")[0]?.end).toEqual({
      status: "completed",
      stoppedBy: "budget",
    });
  });

  it("shows a report that code wrote when no claim was verified (R6)", async () => {
    const groups = activity(await eventsOf("no-claims"));

    expect(only(groups, "report")[0]).toMatchObject({
      phase: "written",
      writtenBy: "code",
      cited: 0,
      state: "done",
    });
    expect(
      only(groups, "read").flatMap((row) => row.dropped.map((c) => c.failed)),
    ).toEqual(["V1", "V1"]);
    expect(only(groups, "end")[0]?.end).toEqual({
      status: "completed",
      stoppedBy: "dead-end",
    });
  });

  it("leaves no row running once the run has ended", async () => {
    for (const name of SCENARIOS.keys()) {
      const rows = rowsOf(activity(await eventsOf(name)));
      expect(
        rows.filter((row) => row.state === "running"),
        name,
      ).toEqual([]);
    }
  });
});

describe("activityOf while the run is running", () => {
  it("never removes a row and never repeats an id as events arrive (F4)", async () => {
    for (const name of SCENARIOS.keys()) {
      const events = await eventsOf(name);
      let before = new Set<string>();
      for (let n = 1; n <= events.length; n += 1) {
        const ids = rowsOf(activity(events.slice(0, n))).map((row) => row.id);
        const now = new Set(ids);
        expect(now.size, `${name}: unique ids after event ${n}`).toBe(
          ids.length,
        );
        expect(
          [...before].filter((id) => !now.has(id)),
          `${name}: rows gone after event ${n}`,
        ).toEqual([]);
        before = now;
      }
    }
  });

  it("names the step that no event has started yet", async () => {
    const events = await eventsOf("completed");
    const stepAfter = (match: (event: RunEvent) => boolean) => {
      const groups = activity(upTo(events, match));
      const running = rowsOf(groups).filter((row) => row.state === "running");
      return [running.map((row) => row.id), currentAction(groups)];
    };

    expect(stepAfter((e) => e.type === "run.started")).toEqual([
      ["r1-plan"],
      "Planning the searches",
    ]);
    expect(stepAfter((e) => e.type === "round.started")).toEqual([
      ["r1-search-0", "r1-search-1"],
      "Running 2 searches",
    ]);
    const lastSearch = events.findLast((e) => e.type === "search.finished");
    expect(stepAfter((e) => e.seq === lastSearch?.seq)).toEqual([
      ["r1-select"],
      "Choosing the pages to read",
    ]);
    expect(
      stepAfter(
        (e) => e.type === "decodo.requested" && e.endpoint === "universal",
      ),
    ).toEqual([
      ["r1-read-https://example.org/lfp-cycle-life/1"],
      "Reading 1 page",
    ]);
    expect(stepAfter((e) => e.type === "reads.finished")).toEqual([
      ["r1-gap"],
      "Checking what is still missing",
    ]);
    expect(stepAfter((e) => e.type === "gap.checked")).toEqual([
      ["report"],
      "Writing the report",
    ]);
    expect(stepAfter((e) => e.type === "report.delta")).toEqual([
      ["report"],
      "Writing the report",
    ]);
  });

  it("keeps a page open until each of its drafted claims is settled", async () => {
    const events = await eventsOf("dropped");
    const afterFirstClaim = activity(
      upTo(events, (e) => e.type === "claim.verified"),
    );
    expect(only(afterFirstClaim, "read")[0]).toMatchObject({
      phase: "checking",
      state: "running",
      endedAt: null,
    });
    expect(currentAction(afterFirstClaim)).toBe(
      "Checking the claims of 1 page",
    );
  });

  it("skips the page selection in a round that found only pages already read", async () => {
    const page = PageUrl.parse("https://example.org/only-page");
    const run = testRun({
      web: {
        search: async () => ({
          status: "ok",
          results: [
            { position: 1, title: "Only page", url: page, snippet: "" },
          ],
        }),
      },
      model: {
        plan: async () => [{ subQuestion: "First?", query: "first" }],
        select: async ({ candidates }) => ({
          picks: candidates.map((c) => c.number),
          map: null,
        }),
        checkGaps: async () => ({
          answered: false,
          missing: ["Second?"],
          queries: [{ subQuestion: "Second?", query: "second" }],
        }),
      },
    });
    await runPipeline(run.deps);
    const searched = upTo(
      run.events,
      (event) => event.type === "search.finished" && event.round === 2,
    );

    const open = rowsOf(activity(searched)).filter(
      (row) => row.state === "running",
    );

    expect(open.map((row) => row.kind)).toEqual(["gap"]);
  });

  it("goes straight to the report after the last round, with no gap check", async () => {
    const events = await eventsOf("budget");
    const groups = activity(
      upTo(events, (e) => e.type === "reads.finished" && e.round === 3),
    );
    expect(
      rowsOf(groups)
        .filter((row) => row.state === "running")
        .map((row) => row.id),
    ).toEqual(["report"]);
  });
});

describe("activityOf on a run that stopped early", () => {
  it("marks open actions as stopped when the run is cancelled", async () => {
    const events = await eventsOf("completed");
    const cancelled = then(
      upTo(events, (e) => e.type === "decodo.requested" && e.call === 2),
      { type: "run.finished", end: { status: "cancelled" } },
    );
    const groups = activity(cancelled);

    expect(only(groups, "search").map((row) => row.state)).toEqual([
      "stopped",
      "stopped",
    ]);
    expect(only(groups, "report")).toEqual([]);
    expect(only(groups, "end")[0]?.end).toEqual({ status: "cancelled" });
    expect(currentAction(groups)).toBeNull();
  });

  it("shows the error of a step, then the report and the end", async () => {
    const run = testRun({
      model: {
        checkGaps: async () => {
          throw new Error("the model refused");
        },
      },
    });
    await runPipeline(run.deps);
    const groups = activity(run.events);

    const closing = groups.at(-1);
    expect(closing?.round).toBeNull();
    expect(closing?.rows.map((row) => row.kind)).toEqual([
      "error",
      "report",
      "end",
    ]);
    expect(only(groups, "error")[0]).toMatchObject({
      state: "failed",
      message: "the model refused",
    });
    expect(only(groups, "end")[0]?.end).toEqual({
      status: "completed",
      stoppedBy: "error",
    });
  });

  it("shows a failed run with its message and no running row", async () => {
    const run = testRun({
      model: {
        // biome-ignore lint/correctness/useYield: the report step fails before its first chunk
        writeReport: async function* () {
          throw new Error("the provider is down");
        },
      },
    });
    await runPipeline(run.deps);
    const groups = activity(run.events);

    expect(only(groups, "end")[0]).toMatchObject({
      state: "failed",
      end: { status: "failed", message: "the provider is down" },
    });
    expect(rowsOf(groups).filter((row) => row.state === "running")).toEqual([]);
  });
});

describe("the web data call behind a row", () => {
  it("names the Decodo endpoint of every search, page read and site map, and of no other row (W2)", async () => {
    const endpoints = new Map<ActivityRow["kind"], Set<string | null>>();
    for (const row of rowsOf(activity(await eventsOf("budget")))) {
      endpoints.set(
        row.kind,
        (endpoints.get(row.kind) ?? new Set()).add(row.decodo),
      );
    }

    expect(
      Object.fromEntries([...endpoints].map(([kind, set]) => [kind, [...set]])),
    ).toEqual({
      plan: [null],
      search: ["google_search"],
      select: [null],
      map: ["map"],
      read: ["universal"],
      skipped: [null],
      gap: [null],
      report: [null],
      end: [null],
    });
  });

  it("names it on a failed search, a failed page read and a read in a browser", async () => {
    const events = await eventsOf("failures");
    const failedPage = PageUrl.parse("https://example.org/lfp-cycle-life/2");
    const groups = activity(
      events.map((event) =>
        event.type === "decodo.requested" && event.input === failedPage
          ? { ...event, rendered: true as const }
          : event,
      ),
    );

    expect(
      only(groups, "search").map((row) => [row.state, row.decodo]),
    ).toEqual([
      ["done", "google_search"],
      ["done", "google_search"],
      ["failed", "google_search"],
    ]);
    expect(
      only(groups, "read").map((row) => [row.state, row.rendered, row.decodo]),
    ).toEqual([
      ["done", false, "universal"],
      ["failed", true, "universal"],
    ]);
  });

  it("names none where the run recorded no request", async () => {
    const events = await eventsOf("budget");
    const planned = upTo(events, (event) => event.type === "round.started");
    const withoutMapRequest = events
      .filter(
        (event) =>
          !(event.type === "decodo.requested" && event.endpoint === "map"),
      )
      .map((event, i) => ({ ...event, seq: i + 1 }));

    expect(
      only(activity(planned), "search").map((row) => [row.state, row.decodo]),
    ).toEqual(Array(BUDGET.queriesPerRound).fill(["running", null]));
    expect(only(activity(withoutMapRequest), "map")[0]).toMatchObject({
      state: "done",
      decodo: null,
    });
  });
});

describe("durations", () => {
  it("uses the measured model time of a step when the run recorded one", async () => {
    const events = await eventsOf("completed");
    const [started, ...rest] = events;
    if (!started) throw new Error("no events");
    const call: RunEventBody = {
      type: "model.called",
      step: "plan",
      outcome: "ok",
      queuedMs: 0,
      durationMs: 4200,
      tokens: {
        input: 1,
        output: 1,
        reasoning: null,
        cacheRead: null,
        cacheWrite: null,
      },
    };
    const withCall = [
      started,
      { ...call, seq: 2, at: started.at } as RunEvent,
      ...rest.map((event) => ({ ...event, seq: event.seq + 1 })),
    ];

    expect(only(activity(withCall), "plan")[0]?.durationMs).toBe(4200);
    expect(only(activity(events), "plan")[0]?.durationMs).toBe(0);
  });

  it("counts every row", async () => {
    expect(rowCount(activity(await eventsOf("failures")))).toBe(11);
  });
});
