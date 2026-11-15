import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { FatalRunError, type ReadOutcome } from "./budget";
import {
  type BudgetEvent,
  PageUrl,
  type PlannedQuery,
  type RunEvent,
} from "./events";
import { MalformedAnswer } from "./model-config";
import { type PipelineLog, runPipeline } from "./pipeline";
import { expectBudgetHeld, PAGE_TEXT, slug, testRun } from "./testing";

const many = (count: number, tag: string): PlannedQuery[] =>
  Array.from({ length: count }, (_, i) => ({
    subQuestion: `${tag} part ${i + 1}`,
    query: `${tag} query ${i + 1}`,
  }));

const typesOf = (events: readonly RunEvent[]) => events.map((e) => e.type);

describe("runPipeline", () => {
  it("runs a question to a cited report", async () => {
    const run = testRun({});
    const end = await runPipeline(run.deps);

    expect(end).toEqual({ status: "completed", stoppedBy: "answered" });
    const view = run.view();
    expect(view.verified).toHaveLength(2);
    expect(view.report?.kind).toBe("final");
    expect(view.report?.markdown).toContain("LFP cells last long [^1].");
    expect(view.report?.markdown).toContain(
      "## Sources\n\n- [lfp cycle life result 1](https://example.org/lfp-cycle-life/1) · example.org · Reference · [^1]",
    );
    expect(run.events.at(-1)?.type).toBe("run.finished");
    expect(run.pages.get("https://example.org/lfp-cycle-life/1")).toBe(
      PAGE_TEXT,
    );
    expectBudgetHeld(run.events);
  });

  it("holds the budget against a greedy model", async () => {
    const run = testRun({
      model: {
        plan: async () => many(9, "plan"),
        select: async ({ candidates }) => ({
          picks: candidates.map((c) => c.number),
          map: { result: 1, need: "everything" },
        }),
        pickFromMap: async ({ urls }) => ({
          picks: Array.from({ length: 50 }, (_, i) => i + 1).concat(
            urls.map((u) => u.number),
          ),
        }),
        checkGaps: async ({ question }) => ({
          answered: false,
          missing: [`more on ${question}`],
          queries: many(9, `gap ${Math.random()}`),
        }),
      },
      web: {
        search: async (query) => ({
          status: "ok",
          results: Array.from({ length: 20 }, (_, i) => ({
            position: i + 1,
            title: `${query} ${i}`,
            url: PageUrl.parse(`https://site.org/${slug(query)}/${i}`),
            snippet: "",
          })),
        }),
        map: async () => ({
          status: "ok",
          urls: Array.from({ length: 60 }, (_, i) =>
            PageUrl.parse(`https://site.org/mapped/${i}`),
          ),
        }),
      },
    });
    const end = await runPipeline(run.deps);

    expect(end).toEqual({ status: "completed", stoppedBy: "budget" });
    expect(run.calls.search).toBe(15);
    expect(run.calls.read).toBe(24);
    expect(run.calls.map).toBe(1);
    expect(run.calls.checkGaps).toBe(2);
    const view = run.view();
    const reasons = Object.values(view.pages).map((p) =>
      p.state.kind === "skipped" ? p.state.reason : p.state.kind,
    );
    expect(reasons.filter((r) => r === "over-budget").length).toBeGreaterThan(
      0,
    );
    expect(reasons.filter((r) => r === "read")).toHaveLength(24);
    expect(view.rounds.map((r) => r.droppedQueries.length)).toEqual([4, 4, 4]);
    expect(view.rounds[0]?.map).toMatchObject({
      outcome: { status: "ok", listed: 60 },
    });
    expectBudgetHeld(run.events);
  });

  it("records failed searches, empty searches, and failed pages, and still completes (F1, F2)", async () => {
    const failing = new Map<string, ReadOutcome>([
      [
        "https://example.org/good/1",
        {
          status: "failed",
          failure: { kind: "http-status", detail: "status 404" },
        },
      ],
      [
        "https://example.org/good/2",
        { status: "failed", failure: { kind: "not-text", detail: "PDF" } },
      ],
    ]);
    const run = testRun({
      model: {
        plan: async () => [
          { subQuestion: "a", query: "good" },
          { subQuestion: "b", query: "empty" },
          { subQuestion: "c", query: "broken" },
        ],
        select: async ({ candidates }) => ({
          picks: candidates.map((c) => c.number),
          map: null,
        }),
      },
      web: {
        search: async (query) => {
          if (query === "empty") return { status: "ok", results: [] };
          if (query === "broken") {
            return {
              status: "failed",
              failure: {
                kind: "rejected",
                detail: "We were not able to scrape",
              },
            };
          }
          return {
            status: "ok",
            results: [1, 2, 3].map((n) => ({
              position: n,
              title: `Good ${n}`,
              url: PageUrl.parse(`https://example.org/good/${n}`),
              snippet: "",
            })),
          };
        },
        read: async (url) =>
          failing.get(url) ?? { status: "ok", markdown: PAGE_TEXT },
      },
    });
    const end = await runPipeline(run.deps);

    expect(end.status).toBe("completed");
    const view = run.view();
    expect(view.rounds[0]?.searches.map((s) => s.outcome?.status)).toEqual([
      "ok",
      "ok",
      "failed",
    ]);
    expect(
      view.rounds[0]?.searches[1]?.outcome?.status === "ok" &&
        view.rounds[0]?.searches[1]?.outcome.results,
    ).toEqual([]);
    expect(view.pages["https://example.org/good/1"]?.state).toEqual({
      kind: "failed",
      failure: { kind: "http-status", detail: "status 404" },
    });
    expect(view.pages["https://example.org/good/2"]?.state.kind).toBe("failed");
    expect(view.pages["https://example.org/good/3"]?.state.kind).toBe("read");
    expect(view.verified).toHaveLength(1);
    expectBudgetHeld(run.events);
  });

  it("drops a changed quote on V1 without a support check, and an unsupported claim on V2 (F3)", async () => {
    const run = testRun({
      model: {
        plan: async () => [{ subQuestion: "a", query: "one" }],
        select: async () => ({ picks: [1], map: null }),
        extract: async () => ({
          label: "Blog",
          claims: [
            {
              statement: "LFP cells last about 4,000 cycles.",
              quote: "LFP cells last about 4,000 cycles.",
            },
            {
              statement: "Heat doubles the life of LFP cells.",
              quote: "Heat shortens their life.",
            },
            {
              statement: "LFP cells last about 3,000 cycles.",
              quote: "LFP cells last about 3,000 cycles.",
            },
          ],
        }),
        supports: async ({ statement }) =>
          statement.startsWith("Heat")
            ? { supported: false, reason: "The quote says the opposite." }
            : { supported: true, reason: "ok" },
      },
    });
    await runPipeline(run.deps);

    const view = run.view();
    expect(view.dropped).toEqual([
      {
        url: "https://example.org/one/1",
        statement: "LFP cells last about 4,000 cycles.",
        quote: "LFP cells last about 4,000 cycles.",
        failed: "V1",
        reason: "not-on-page",
      },
      {
        url: "https://example.org/one/1",
        statement: "Heat doubles the life of LFP cells.",
        quote: "Heat shortens their life.",
        failed: "V2",
        reason: "The quote says the opposite.",
      },
    ]);
    expect(run.calls.supports).toBe(2);
    expect(view.verified.map((c) => c.statement)).toEqual([
      "LFP cells last about 3,000 cycles.",
    ]);
    expectBudgetHeld(run.events);
  });

  it("keeps a page whose extraction is malformed and drops a claim whose support check is malformed", async () => {
    let extracts = 0;
    const run = testRun({
      model: {
        plan: async () => [{ subQuestion: "a", query: "one" }],
        extract: async () => {
          extracts += 1;
          if (extracts === 1) throw new MalformedAnswer("extract", "bad JSON");
          return {
            label: "Reference",
            claims: [{ statement: "S", quote: "Heat shortens their life." }],
          };
        },
        supports: async () => {
          throw new MalformedAnswer("supports", "bad JSON");
        },
      },
    });
    const end = await runPipeline(run.deps);

    expect(end).toEqual({ status: "completed", stoppedBy: "answered" });
    const view = run.view();
    expect(
      Object.values(view.pages).filter(
        (p) => p.state.kind === "read" && p.state.extractError === "bad JSON",
      ),
    ).toHaveLength(1);
    expect(view.dropped).toEqual([
      expect.objectContaining({
        failed: "V2",
        reason: "the support check did not complete: bad JSON",
      }),
    ]);
    expect(view.verified).toEqual([]);
    expect(view.error).toBeNull();
    expectBudgetHeld(run.events);
  });

  it("saves a fatal error in round 2 and reports the claims of round 1", async () => {
    const run = testRun({
      model: {
        plan: async () => [{ subQuestion: "a", query: "first" }],
        select: async () => ({ picks: [1], map: null }),
        checkGaps: async () => ({
          answered: false,
          missing: ["the rest"],
          queries: [{ subQuestion: "b", query: "second" }],
        }),
        extract: async ({ title }) => {
          if (title.startsWith("second")) {
            throw new FatalRunError("extract", "provider refused");
          }
          return {
            label: "Paper",
            claims: [
              {
                statement: "LFP cells last about 3,000 cycles.",
                quote: "LFP cells last about 3,000 cycles.",
              },
            ],
          };
        },
      },
    });
    const end = await runPipeline(run.deps);

    expect(end).toEqual({ status: "completed", stoppedBy: "error" });
    const view = run.view();
    expect(view.error).toEqual({
      step: "extract",
      message: "provider refused",
    });
    expect(view.verified.map((c) => c.source.url)).toEqual([
      "https://example.org/first/1",
    ]);
    expect(view.report).toMatchObject({ kind: "final", writtenBy: "model" });
    expect(view.report?.markdown).toContain("[^1]");
    expectBudgetHeld(run.events);
  });

  it("writes the report in code when a fatal error leaves no claim", async () => {
    const run = testRun({
      model: {
        plan: async () => {
          throw new FatalRunError("plan", "invalid x-api-key");
        },
      },
    });
    const end = await runPipeline(run.deps);

    expect(end).toEqual({ status: "completed", stoppedBy: "error" });
    expect(run.calls.writeReport).toBe(0);
    expect(run.calls.search).toBe(0);
    const view = run.view();
    expect(view.report).toMatchObject({ kind: "final", writtenBy: "code" });
    expect(view.report?.markdown).toContain("invalid x-api-key");
    expect(view.report?.markdown).toContain("The run made no search.");
    expectBudgetHeld(run.events);
  });

  it("fails the run without a report when the report step fails", async () => {
    const run = testRun({
      model: {
        writeReport: () => ({
          [Symbol.asyncIterator]: () => ({
            next: () =>
              Promise.reject(new FatalRunError("writeReport", "overloaded")),
          }),
        }),
      },
    });
    const end = await runPipeline(run.deps);

    expect(end).toEqual({ status: "failed", message: "overloaded" });
    expect(run.view().report).toBeNull();
    expect(typesOf(run.events)).not.toContain("report.finished");
    expectBudgetHeld(run.events);
  });

  it("cancels during the reads: no report, and late results add no event (U5)", async () => {
    const late: ((outcome: ReadOutcome) => void)[] = [];
    const run = testRun({
      web: {
        read: () => new Promise<ReadOutcome>((resolve) => late.push(resolve)),
      },
    });
    const finished = runPipeline(run.deps);
    await vi.waitFor(() => expect(late.length).toBeGreaterThan(0));
    run.cancel();
    const end = await finished;

    expect(end).toEqual({ status: "cancelled" });
    const count = run.events.length;
    expect(run.events.at(-1)).toMatchObject({
      type: "run.finished",
      end: { status: "cancelled" },
    });
    expect(typesOf(run.events)).not.toContain("report.finished");
    expect(run.calls.writeReport).toBe(0);

    for (const resolve of late) resolve({ status: "ok", markdown: PAGE_TEXT });
    await new Promise((r) => setTimeout(r, 10));
    expect(run.events).toHaveLength(count);
    expect(run.calls.extract).toBe(0);
    expect(
      run.view().decodoCalls.filter((c) => c.outcome === "abandoned"),
    ).toHaveLength(late.length);
    expectBudgetHeld(run.events);
  });

  it("does no work for a run that was cancelled before it started", async () => {
    const run = testRun({});
    run.cancel();
    expect(await runPipeline(run.deps)).toEqual({ status: "cancelled" });
    expect(typesOf(run.events)).toEqual(["run.finished"]);
    expect(run.calls.plan).toBe(0);
    expectBudgetHeld(run.events);
  });

  it("gives the pipeline no handle to write a budget event or to end the run", () => {
    type Emittable = Parameters<PipelineLog["emit"]>[0]["type"];
    expectTypeOf<
      Extract<Emittable, BudgetEvent["type"] | "run.finished">
    >().toBeNever();
  });
});
