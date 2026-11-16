import { describe, expect, it } from "vitest";
import {
  BUDGET,
  FatalRunError,
  type MapOutcome,
  meterWeb,
  type ReadOutcome,
  RunCancelled,
  type WebActions,
} from "./budget";
import {
  type BudgetEvent,
  PageUrl,
  type PlannedQuery,
  SiteUrl,
} from "./events";

const url = (n: number) => PageUrl.parse(`https://example.org/page-${n}`);
const pages = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ url: url(from + i) }));
const queries = (count: number): PlannedQuery[] =>
  Array.from({ length: count }, (_, i) => ({
    subQuestion: `sub ${i + 1}`,
    query: `query ${i + 1}`,
  }));
const site = SiteUrl.parse("https://example.org");

function setup(web: Partial<WebActions> = {}) {
  const events: BudgetEvent[] = [];
  const calls = { search: [] as string[], read: [] as string[], map: 0 };
  const controller = new AbortController();
  let clock = 0;
  const fake: WebActions = {
    search: async (query) => {
      calls.search.push(query);
      return web.search ? web.search(query) : { status: "ok", results: [] };
    },
    read: async (page) => {
      calls.read.push(page);
      return web.read ? web.read(page) : { status: "ok", markdown: "text" };
    },
    map: async (target, limit) => {
      calls.map += 1;
      return web.map ? web.map(target, limit) : { status: "ok", urls: [] };
    },
  };
  const meter = meterWeb({
    web: fake,
    emit: (event) => events.push(event),
    signal: controller.signal,
    now: () => {
      clock += 5;
      return clock;
    },
  });
  return { meter, events, calls, controller };
}

function open(meter: ReturnType<typeof setup>["meter"], count = 1) {
  const round = meter.openRound(queries(count));
  if (round === null) throw new Error("expected a round");
  return round;
}

describe("meterWeb rounds (B1, B2)", () => {
  it("opens at most 3 rounds and returns null for a 4th", () => {
    const { meter, events } = setup();
    expect([1, 2, 3].map(() => open(meter).no)).toEqual([1, 2, 3]);
    expect(meter.openRound(queries(1))).toBeNull();
    expect(events.filter((e) => e.type === "round.started")).toHaveLength(3);
  });

  it("marks only round 3 as the last round", () => {
    const { meter } = setup();
    expect(
      [open(meter), open(meter), open(meter)].map((r) => r.isLast),
    ).toEqual([false, false, true]);
  });

  it("runs 5 of 9 queries and records the other 4 as dropped", async () => {
    const { meter, events, calls } = setup();
    const round = open(meter, 9);
    await Promise.all(round.searches.map((search) => search.outcome));

    expect(round.searches.map((s) => s.query.query)).toEqual(
      queries(5).map((q) => q.query),
    );
    expect(calls.search).toHaveLength(5);
    expect(events[0]).toEqual({
      type: "round.started",
      round: 1,
      queries: queries(5),
      droppedQueries: queries(9).slice(5),
    });
  });
});

describe("meterWeb reads (B2, B3)", () => {
  it("grants 8 of 20 pages and refuses 12 as over budget", async () => {
    const { meter, calls } = setup();
    const plan = open(meter).read(pages(1, 20));
    await Promise.all(plan.granted.map((g) => g.outcome));

    expect(plan.granted.map((g) => g.item.url)).toEqual(
      pages(1, 8).map((p) => p.url),
    );
    expect(plan.refused).toEqual(
      pages(9, 12).map((item) => ({ item, reason: "over-budget" })),
    );
    expect(calls.read).toHaveLength(8);
  });

  it("shares the 8 reads between two read calls of one round", async () => {
    const { meter, calls } = setup();
    const round = open(meter);
    const first = round.read(pages(1, 5));
    const second = round.read(pages(6, 5));

    expect(first.granted).toHaveLength(5);
    expect(second.granted).toHaveLength(3);
    expect(second.refused.map((r) => r.reason)).toEqual([
      "over-budget",
      "over-budget",
    ]);
    await Promise.all(
      [...first.granted, ...second.granted].map((g) => g.outcome),
    );
    expect(calls.read).toHaveLength(8);
  });

  it("gives every round its own 8 reads", () => {
    const { meter } = setup();
    expect(open(meter).read(pages(1, 10)).granted).toHaveLength(8);
    expect(open(meter).read(pages(11, 10)).granted).toHaveLength(8);
  });

  it("counts pages picked from the map toward the 8 reads", async () => {
    const mapped = [url(100), url(101), url(102)];
    const { meter, calls } = setup({
      map: async () => ({ status: "ok", urls: mapped }),
    });
    const round = open(meter);
    const listed = await round.map(site, 100);
    if (listed?.status !== "ok") throw new Error("expected a map");

    const plan = round.read([
      ...listed.urls.map((u) => ({ url: u })),
      ...pages(1, 10),
    ]);
    expect(plan.granted.map((g) => g.item.url)).toEqual([
      ...mapped,
      ...pages(1, 5).map((p) => p.url),
    ]);
    await Promise.all(plan.granted.map((g) => g.outcome));
    expect(calls.read).toHaveLength(8);
  });

  it("refuses a URL that the run already asked for, in the same or a later round", async () => {
    const { meter, calls } = setup();
    const first = open(meter).read([{ url: url(1) }, { url: url(1) }]);
    expect(first.refused).toEqual([
      { item: { url: url(1) }, reason: "already-read" },
    ]);
    const later = open(meter).read([{ url: url(1) }]);
    expect(later.granted).toHaveLength(0);
    expect(later.refused).toEqual([
      { item: { url: url(1) }, reason: "already-read" },
    ]);
    await Promise.all(first.granted.map((g) => g.outcome));
    expect(calls.read).toEqual([url(1)]);
  });

  it("refuses a URL again even when its first read failed", async () => {
    const { meter, calls } = setup({
      read: async () => ({
        status: "failed",
        failure: { kind: "timeout", detail: "slow" },
      }),
    });
    const first = open(meter).read([{ url: url(1) }]);
    await first.granted[0]?.outcome;
    expect(open(meter).read([{ url: url(1) }]).refused).toHaveLength(1);
    expect(calls.read).toHaveLength(1);
  });

  it("records the granted and refused reads as reads.planned", () => {
    const { meter, events } = setup();
    open(meter).read([...pages(1, 9), { url: url(1) }]);
    expect(events.find((e) => e.type === "reads.planned")).toEqual({
      type: "reads.planned",
      round: 1,
      granted: pages(1, 8).map((p) => p.url),
      refused: [
        { url: url(9), reason: "over-budget" },
        { url: url(1), reason: "already-read" },
      ],
    });
  });
});

describe("meterWeb map (B3)", () => {
  it("allows one map per run and returns null for a second, also in a later round", async () => {
    const { meter, calls } = setup();
    const round = open(meter);
    await round.map(site, 10);
    expect(round.map(site, 10)).toBeNull();
    expect(open(meter).map(site, 10)).toBeNull();
    expect(calls.map).toBe(1);
  });

  it("counts a failed map as the run's one map", async () => {
    const failed: MapOutcome = {
      status: "failed",
      failure: { kind: "unsupported", detail: "Url is not supported." },
    };
    const { meter, calls } = setup({ map: async () => failed });
    const round = open(meter);
    await expect(round.map(site, 10)).resolves.toEqual(failed);
    expect(round.map(site, 10)).toBeNull();
    expect(calls.map).toBe(1);
  });
});

describe("meterWeb closed rounds", () => {
  it("throws when a closed round reads or maps", () => {
    const { meter, calls } = setup();
    const first = open(meter);
    open(meter);
    expect(() => first.read(pages(1, 1))).toThrow();
    expect(() => first.map(site, 10)).toThrow();
    expect(calls.read).toHaveLength(0);
    expect(calls.map).toBe(0);
  });
});

describe("meterWeb audit", () => {
  it("writes decodo.requested before the call and decodo.settled after it", async () => {
    let resolve: (outcome: ReadOutcome) => void = () => {};
    const { meter, events } = setup({
      read: () =>
        new Promise<ReadOutcome>((r) => {
          resolve = r;
        }),
    });
    const round = open(meter, 0);
    const plan = round.read([{ url: url(1) }]);
    expect(events.slice(1)).toEqual([
      { type: "reads.planned", round: 1, granted: [url(1)], refused: [] },
      {
        type: "decodo.requested",
        call: 1,
        round: 1,
        endpoint: "universal",
        input: url(1),
      },
    ]);

    resolve({ status: "ok", markdown: "hello" });
    await plan.granted[0]?.outcome;
    const settled = events.find((e) => e.type === "decodo.settled");
    expect(settled).toMatchObject({
      type: "decodo.settled",
      call: 1,
      outcome: "ok",
    });
    expect(settled?.type === "decodo.settled" && settled.durationMs).toBe(5);
  });

  it("numbers calls across endpoints and records a failed search as failed", async () => {
    const { meter, events } = setup({
      search: async () => ({
        status: "failed",
        failure: { kind: "rejected", detail: "We were not able to scrape" },
      }),
    });
    const round = open(meter, 2);
    await Promise.all(round.searches.map((s) => s.outcome));
    await round.read([{ url: url(1) }]).granted[0]?.outcome;
    await round.map(site, 10);

    const requested = events.flatMap((e) =>
      e.type === "decodo.requested" ? [[e.call, e.endpoint]] : [],
    );
    expect(requested).toEqual([
      [1, "google_search"],
      [2, "google_search"],
      [3, "universal"],
      [4, "map"],
    ]);
    const settled = events.flatMap((e) =>
      e.type === "decodo.settled" ? [[e.call, e.outcome]] : [],
    );
    expect(settled).toEqual(
      expect.arrayContaining([
        [1, "failed"],
        [2, "failed"],
        [3, "ok"],
        [4, "ok"],
      ]),
    );
  });

  it("records a fatal web error as a failed call and passes the error on", async () => {
    const fatal = new FatalRunError("decodo", "key rejected");
    const { meter, events } = setup({
      read: () => Promise.reject(fatal),
    });
    const outcome = open(meter, 0).read([{ url: url(1) }]).granted[0]?.outcome;
    await expect(outcome).rejects.toBe(fatal);
    expect(events.find((e) => e.type === "decodo.settled")).toMatchObject({
      call: 1,
      outcome: "failed",
      detail: "key rejected",
    });
  });
});

describe("meterWeb after a cancel", () => {
  it("rejects an open call at once with RunCancelled", async () => {
    const { meter, controller } = setup({
      read: () => new Promise<ReadOutcome>(() => {}),
    });
    const outcome = open(meter, 0).read([{ url: url(1) }]).granted[0]?.outcome;
    controller.abort();
    await expect(outcome).rejects.toBeInstanceOf(RunCancelled);
  });

  it("lets no new call reach the web", async () => {
    const { meter, controller, calls } = setup();
    const round = open(meter, 0);
    controller.abort();

    const plan = round.read(pages(1, 3));
    const results = await Promise.allSettled(
      plan.granted.map((g) => g.outcome),
    );
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    await expect(round.map(site, 10)).rejects.toBeInstanceOf(RunCancelled);
    expect(() => meter.openRound(queries(1))).toThrow(RunCancelled);
    expect(calls.read).toHaveLength(0);
    expect(calls.map).toBe(0);
    expect(calls.search).toHaveLength(0);
  });
});

it("holds the PRD limits", () => {
  expect(BUDGET).toEqual({
    rounds: 3,
    queriesPerRound: 5,
    readsPerRound: 8,
    mapsPerRun: 1,
  });
});
