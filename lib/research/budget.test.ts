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
  const calls = {
    search: [] as string[],
    read: [] as string[],
    rendered: [] as string[],
    map: 0,
  };
  const controller = new AbortController();
  let clock = 0;
  const fake: WebActions = {
    search: async (query) => {
      calls.search.push(query);
      return web.search ? web.search(query) : { status: "ok", results: [] };
    },
    read: async (page, mode) => {
      calls.read.push(page);
      if (mode === "rendered") calls.rendered.push(page);
      return web.read
        ? web.read(page, mode)
        : { status: "ok", markdown: "text" };
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

const finished = (events: readonly BudgetEvent[]) =>
  events.filter((e) => e.type === "reads.finished");

describe("meterWeb reads (B2, B3)", () => {
  it("reads 8 of 20 pages and skips 12 as over budget", async () => {
    const { meter, calls, events } = setup();
    expect(okCount(await readAll(open(meter), pages(1, 20)))).toBe(8);
    expect(calls.read).toEqual(pages(1, 8).map((p) => p.url));
    expect(finished(events)).toEqual([
      {
        type: "reads.finished",
        round: 1,
        skipped: pages(9, 12).map((p) => ({
          url: p.url,
          reason: "over-budget",
        })),
      },
    ]);
  });

  it("shares the 8 reads between two read calls of one round", async () => {
    const { meter, calls, events } = setup();
    const round = open(meter);
    await readAll(round, pages(1, 5));
    await readAll(round, pages(6, 5));
    expect(calls.read).toHaveLength(8);
    expect(finished(events)[1]?.skipped.map((s) => s.reason)).toEqual([
      "over-budget",
      "over-budget",
    ]);
  });

  it("gives every round its own 8 reads", async () => {
    const { meter } = setup();
    expect(okCount(await readAll(open(meter), pages(1, 10)))).toBe(8);
    expect(okCount(await readAll(open(meter), pages(11, 10)))).toBe(8);
  });

  it("counts pages picked from the map toward the 8 reads", async () => {
    const mapped = [url(100), url(101), url(102)];
    const { meter, calls } = setup({
      map: async () => ({ status: "ok", urls: mapped }),
    });
    const round = open(meter);
    const listed = await round.map(site, 100);
    if (listed?.status !== "ok") throw new Error("expected a map");

    await readAll(round, [
      ...listed.urls.map((u) => ({ url: u })),
      ...pages(1, 10),
    ]);
    expect(calls.read).toEqual([...mapped, ...pages(1, 5).map((p) => p.url)]);
  });

  it("skips a URL that the run already asked for, in the same or a later round", async () => {
    const { meter, calls, events } = setup();
    await readAll(open(meter), [{ url: url(1) }, { url: url(1) }]);
    await readAll(open(meter), [{ url: url(1) }]);
    expect(
      events.flatMap((e) => (e.type === "reads.queued" ? [e] : [])),
    ).toEqual([
      {
        type: "reads.queued",
        round: 1,
        queue: [url(1)],
        skipped: [{ url: url(1), reason: "already-read" }],
      },
      {
        type: "reads.queued",
        round: 2,
        queue: [],
        skipped: [{ url: url(1), reason: "already-read" }],
      },
    ]);
    expect(calls.read).toEqual([url(1)]);
  });

  it("skips a URL again even when its first read failed", async () => {
    const { meter, calls } = setup({ read: async () => failed("http-status") });
    await readAll(open(meter), [{ url: url(1) }]);
    await readAll(open(meter), [{ url: url(1) }]);
    expect(calls.read).toHaveLength(1);
  });

  it("records the reading order and the skipped reads", async () => {
    const { meter, events } = setup();
    await readAll(open(meter), [...pages(1, 9), { url: url(1) }]);
    expect(events.find((e) => e.type === "reads.queued")).toEqual({
      type: "reads.queued",
      round: 1,
      queue: pages(1, 9).map((p) => p.url),
      skipped: [{ url: url(1), reason: "already-read" }],
    });
    expect(finished(events)[0]?.skipped).toEqual([
      { url: url(9), reason: "over-budget" },
    ]);
  });
});

const failed = (
  kind: "http-status" | "unsupported" | "empty",
): ReadOutcome => ({
  status: "failed",
  failure: { kind, detail: kind },
});

async function readAll(
  round: ReturnType<typeof open>,
  items: readonly { url: PageUrl }[],
) {
  const outcomes = new Map<string, ReadOutcome>();
  await round.read(items, async (item, outcome) => {
    outcomes.set(item.url, outcome);
  });
  return outcomes;
}

const okCount = (outcomes: Map<string, ReadOutcome>) =>
  [...outcomes.values()].filter((o) => o.status === "ok").length;

describe("meterWeb read attempts (B2, B7)", () => {
  it("replaces a failed read with the next page until 8 pages are read", async () => {
    const failing = new Set(pages(1, 5).map((p) => p.url));
    const { meter, calls, events } = setup({
      read: async (page) =>
        failing.has(page)
          ? failed("http-status")
          : { status: "ok", markdown: "text" },
    });
    const outcomes = await readAll(open(meter), pages(1, 20));

    expect(okCount(outcomes)).toBe(8);
    expect(calls.read).toEqual(pages(1, 13).map((p) => p.url));
    expect(events.find((e) => e.type === "reads.finished")).toEqual({
      type: "reads.finished",
      round: 1,
      skipped: pages(14, 7).map((p) => ({ url: p.url, reason: "over-budget" })),
    });
  });

  it("stops at 16 attempts when every read fails", async () => {
    const { meter, calls } = setup({ read: async () => failed("http-status") });
    const outcomes = await readAll(open(meter), pages(1, 30));
    expect(calls.read).toHaveLength(BUDGET.readAttemptsPerRound);
    expect(okCount(outcomes)).toBe(0);
  });

  it("starts 8 reads at once and never more than 8 successful reads", async () => {
    const { meter, calls } = setup();
    const round = open(meter);
    const pending = readAll(round, pages(1, 20));
    expect(calls.read).toHaveLength(8);
    expect(okCount(await pending)).toBe(8);
    expect(calls.read).toHaveLength(8);
  });

  it("ends the reads when no page is left", async () => {
    const { meter, calls, events } = setup({
      read: async () => failed("http-status"),
    });
    await readAll(open(meter), pages(1, 3));
    expect(calls.read).toHaveLength(3);
    expect(events.find((e) => e.type === "reads.finished")).toEqual({
      type: "reads.finished",
      round: 1,
      skipped: [],
    });
  });

  it("makes no request for another page of a site that refused a page", async () => {
    const refused = (n: number) => PageUrl.parse(`https://refused.org/${n}`);
    const { meter, calls, events } = setup({
      read: async (page) =>
        page.startsWith("https://refused.org/")
          ? failed("unsupported")
          : { status: "ok", markdown: "text" },
    });
    const first = await readAll(open(meter), [
      { url: refused(1) },
      ...pages(1, 7),
      { url: refused(2) },
      ...pages(8, 3),
    ]);
    expect(okCount(first)).toBe(8);
    expect(calls.read).not.toContain(refused(2));
    expect(events.find((e) => e.type === "reads.finished")).toMatchObject({
      skipped: expect.arrayContaining([
        { url: refused(2), reason: "site-refused" },
      ]),
    });

    await readAll(open(meter), [{ url: refused(3) }, ...pages(20, 1)]);
    expect(calls.read).not.toContain(refused(3));
    expect(events.findLast((e) => e.type === "reads.queued")).toEqual({
      type: "reads.queued",
      round: 2,
      queue: [url(20)],
      skipped: [{ url: refused(3), reason: "site-refused" }],
    });
  });

  it("retries an empty page once with rendering, and the retry is an attempt", async () => {
    const { meter, calls, events } = setup({
      read: async (_page, mode) =>
        mode === "rendered"
          ? { status: "ok", markdown: "text" }
          : failed("empty"),
    });
    const outcomes = await readAll(open(meter), pages(1, 1));

    expect(outcomes.get(url(1))).toEqual({ status: "ok", markdown: "text" });
    expect(calls.read).toEqual([url(1), url(1)]);
    expect(calls.rendered).toEqual([url(1)]);
    expect(
      events
        .filter((e) => e.type === "decodo.requested")
        .map((e) => e.rendered),
    ).toEqual([undefined, true]);
  });

  it("fails an empty page that rendering does not fix", async () => {
    const { meter, calls } = setup({ read: async () => failed("empty") });
    const outcomes = await readAll(open(meter), pages(1, 1));
    expect(outcomes.get(url(1))).toMatchObject({
      status: "failed",
      failure: { kind: "empty" },
    });
    expect(calls.read).toHaveLength(2);
  });

  it("counts rendered retries toward the 16 attempts", async () => {
    const { meter, calls } = setup({ read: async () => failed("empty") });
    await readAll(open(meter), pages(1, 30));
    expect(calls.read).toHaveLength(BUDGET.readAttemptsPerRound);
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
    expect(() => first.read(pages(1, 1), async () => {})).toThrow();
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
    const reading = readAll(round, [{ url: url(1) }]);
    expect(events.slice(1)).toEqual([
      { type: "reads.queued", round: 1, queue: [url(1)], skipped: [] },
      {
        type: "decodo.requested",
        call: 1,
        round: 1,
        endpoint: "universal",
        input: url(1),
      },
    ]);

    resolve({ status: "ok", markdown: "hello" });
    await reading;
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
    await readAll(round, [{ url: url(1) }]);
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
    await expect(readAll(open(meter, 0), [{ url: url(1) }])).rejects.toBe(
      fatal,
    );
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
    const reading = readAll(open(meter, 0), [{ url: url(1) }]);
    controller.abort();
    await expect(reading).rejects.toBeInstanceOf(RunCancelled);
  });

  it("lets no new call reach the web", async () => {
    const { meter, controller, calls } = setup();
    const round = open(meter, 0);
    controller.abort();

    await expect(readAll(round, pages(1, 3))).rejects.toBeInstanceOf(
      RunCancelled,
    );
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
    readAttemptsPerRound: 16,
    mapsPerRun: 1,
  });
});
