import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { problemsOf } from "../../scripts/report-render-check";
import { FatalRunError, type ReadOutcome } from "./budget";
import {
  type BudgetEvent,
  PageUrl,
  type PlannedQuery,
  type RunEvent,
} from "./events";
import { MalformedAnswer } from "./model-config";
import { type PipelineLog, runPipeline } from "./pipeline";
import { createView, replay } from "./run-view";
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

  it("reads 8 pages in a round where 5 of the first 8 reads fail (B7)", async () => {
    const results = (query: string) =>
      Array.from({ length: 20 }, (_, i) => ({
        position: i + 1,
        title: `${query} ${i + 1}`,
        url: PageUrl.parse(`https://site-${i + 1}.org/${slug(query)}`),
        snippet: "",
      }));
    const run = testRun({
      model: {
        plan: async () => [{ subQuestion: "a", query: "many" }],
        select: async ({ candidates }) => ({
          picks: candidates.map((c) => c.number),
          map: null,
        }),
      },
      web: {
        search: async (query) => ({ status: "ok", results: results(query) }),
        read: async (url) =>
          /site-[1-5]\./.test(url)
            ? {
                status: "failed",
                failure: { kind: "rejected", detail: "not scraped" },
              }
            : { status: "ok", markdown: PAGE_TEXT },
      },
    });
    await runPipeline(run.deps);

    const inRound1 = run.events.filter((e) => "round" in e && e.round === 1);
    expect(inRound1.filter((e) => e.type === "page.read")).toHaveLength(8);
    expect(inRound1.filter((e) => e.type === "page.failed")).toHaveLength(5);
    expect(run.calls.read).toBe(13);
    expectBudgetHeld(run.events);
  });

  it("gives every page that the run found one state: read, failed, or skipped with its reason (F1)", async () => {
    const run = testRun({
      model: {
        plan: async () => [{ subQuestion: "a", query: "first" }],
        select: async ({ candidates }) => ({
          picks: candidates.slice(0, 12).map((c) => c.number),
          map: null,
        }),
        checkGaps: async () => ({
          answered: false,
          missing: ["more"],
          queries: [{ subQuestion: "b", query: "second" }],
        }),
      },
      web: {
        search: async (query) => ({
          status: "ok",
          results: Array.from({ length: 14 }, (_, i) => ({
            position: i + 1,
            title: `${query} ${i}`,
            url: PageUrl.parse(
              i % 8 === 0
                ? `https://refused.gov/${query}/${i}`
                : `https://site.org/${query}/${i}`,
            ),
            snippet: "",
          })),
        }),
        read: async (url) =>
          url.startsWith("https://refused.gov/")
            ? {
                status: "failed",
                failure: {
                  kind: "unsupported",
                  detail: "Url is not supported.",
                },
              }
            : { status: "ok", markdown: PAGE_TEXT },
      },
    });
    await runPipeline(run.deps);

    const found = new Set(
      run.events.flatMap((e) =>
        e.type === "search.finished" && e.outcome.status === "ok"
          ? e.outcome.results.map((r) => r.url)
          : [],
      ),
    );
    const view = run.view();
    expect(Object.keys(view.pages).sort()).toEqual([...found].sort());
    const states = Object.values(view.pages).map((p) =>
      p.state.kind === "skipped" ? `skipped:${p.state.reason}` : p.state.kind,
    );
    expect(new Set(states)).toEqual(
      new Set([
        "read",
        "failed",
        "skipped:site-refused",
        "skipped:over-budget",
        "skipped:not-chosen",
      ]),
    );
    expect(
      run
        .view()
        .decodoCalls.filter((c) => c.input.startsWith("https://refused.gov/")),
    ).toHaveLength(1);
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

describe("report deltas (U3, #6)", () => {
  const deltasOf = (events: readonly RunEvent[]) =>
    events.flatMap((e) => (e.type === "report.delta" ? [e.text] : []));
  const bodyOf = (events: readonly RunEvent[]) => {
    const finished = events.find((e) => e.type === "report.finished");
    if (finished?.type !== "report.finished") throw new Error("no report");
    return finished.markdown.split("\n\n## Sources")[0];
  };
  const writing = (chunks: readonly string[]) => ({
    writeReport: async function* () {
      yield* chunks;
    },
    classifySentences: async ({
      sentences,
    }: {
      sentences: readonly string[];
    }) => ({
      verdicts: sentences.map((_, i) => ({
        sentence: i + 1,
        verdict: "connective" as const,
        reason: "It connects.",
      })),
    }),
  });
  const inPieces = (text: string, size: number) =>
    Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
      text.slice(i * size, (i + 1) * size),
    );

  it("stores no image, HTML or link, even when a construct spans two chunks", async () => {
    const run = testRun({
      model: writing([
        "# Answer\n\nSee ![x](https://evil.ex",
        "ample/s.png) and [a](https:",
        "//evil.example/l) [^1].\n",
        '\n<img src="https://evil.example/d.png"> <https://evil.',
        "example/c>\n\n- One [^2]\n- Two ![y][r]\n\n[r]: https://evil.exam",
        "ple/r.png\n\nEnd [^9] www.evil.example.",
      ]),
    });
    await runPipeline(run.deps);

    const deltas = deltasOf(run.events);
    expect(deltas.length).toBeGreaterThan(1);
    for (const text of [...deltas, deltas.join("")]) {
      expect(problemsOf(text, [])).toEqual([]);
      expect(text).not.toMatch(/(?<!\\)(?:\]\(|!\[|<[a-z])|\[\^9\]/i);
    }
  });

  it.each([
    [
      "a mixed draft",
      "# Answer\n\nLFP lasts **long** [^1] and see [this](https://evil.example).\n\n## Detail\n\n- First [^2]\n- Second [^1, ^2]\n\n<b>End</b> [^2] [^7].",
    ],
    [
      "a paragraph that runs into a list",
      "Guidance varies:\n- One [^1]\n- Two [^2]\n\n## Next\nMore [^1].",
    ],
    [
      "a list item that the cleanup drops",
      '- One [^1]\n- <img src="https://evil.example/x.png">\n\nEnd [^1].',
    ],
  ])(
    "streams the same text as the final report without its source list for %s",
    async (_, draft) => {
      const run = testRun({ model: writing(inPieces(draft, 7)) });
      await runPipeline(run.deps);

      expect(deltasOf(run.events).join("").trimEnd()).toBe(bodyOf(run.events));
    },
  );

  it("shows a finished paragraph before the model ends the report", async () => {
    const seen: unknown[] = [];
    const run = testRun({
      model: {
        writeReport: async function* () {
          yield "First [^1].\n\n";
          seen.push(run.view().report);
          yield "Second [^1].";
        },
      },
    });
    await runPipeline(run.deps);

    expect(seen).toEqual([{ kind: "draft", markdown: "First [^1].\n\n" }]);
    expect(deltasOf(run.events)).toEqual(["First [^1].\n\n", "Second [^1].\n"]);
  });

  it("does not stream a source section that the model wrote", async () => {
    const run = testRun({
      model: writing([
        "Answer [^1].\n\n## Sources\n\n- [Fake](https://fake.example) [^1]\n",
      ]),
    });
    await runPipeline(run.deps);

    const live = deltasOf(run.events).join("");
    expect(live).not.toContain("Sources");
    expect(live).not.toContain("fake.example");
    expect(live.trimEnd()).toBe(bodyOf(run.events));
  });
});

describe("citation check (R3, R4, #7)", () => {
  type Steps = Parameters<typeof testRun>[0]["model"];
  const writing = (draft: string) => ({
    writeReport: async function* () {
      yield draft;
    },
  });
  const verdicts =
    (...kinds: ("fact" | "connective" | "scope")[]) =>
    async ({ sentences }: { sentences: readonly string[] }) => ({
      verdicts: sentences.map((_, i) => ({
        sentence: i + 1,
        verdict: kinds[i] ?? kinds.at(-1) ?? "fact",
        reason: `Reason ${i + 1}.`,
      })),
    });
  const runWith = async (model: Steps) => {
    const run = testRun({ model });
    const end = await runPipeline(run.deps);
    expect(end.status).toBe("completed");
    const checked = run.events.find((e) => e.type === "report.checked");
    if (checked?.type !== "report.checked") throw new Error("no check event");
    const report = run.view().report;
    const body = report?.markdown.split("\n\n## Sources")[0] ?? "";
    return { run, checked, body };
  };

  it("makes no extra model call for a report whose every sentence cites a claim", async () => {
    const { run, checked } = await runWith(
      writing("# Answer\n\nLFP lasts long [^1]. Heat hurts. [^2]"),
    );
    expect(run.calls.classifySentences).toBe(0);
    expect(run.calls.repairSentences).toBe(0);
    expect(checked).toMatchObject({
      uncited: [],
      repairs: [],
      rewritten: [],
      removed: [],
      modelCalls: 0,
    });
  });

  it("cites a claim that supports an uncited factual sentence", async () => {
    const seen: unknown[] = [];
    const { run, checked, body } = await runWith({
      ...writing("LFP lasts long [^1]. LFP cells last about 3,000 cycles."),
      repairSentences: async (input) => {
        seen.push(input);
        return {
          repairs: [{ sentence: 1, action: "cite", claims: [2], text: "" }],
        };
      },
    });
    expect(body).toBe(
      "LFP lasts long [^1]. LFP cells last about 3,000 cycles [^2].",
    );
    expect(run.calls.classifySentences).toBe(1);
    expect(run.calls.repairSentences).toBe(1);
    expect(seen).toMatchObject([
      {
        sentences: [
          { text: "LFP cells last about 3,000 cycles.", opening: true },
        ],
        claims: [{ number: 1 }, { number: 2 }],
      },
    ]);
    expect(checked).toMatchObject({
      uncited: [
        {
          text: "LFP cells last about 3,000 cycles.",
          opening: true,
          verdict: "fact",
        },
      ],
      repairs: [
        { sentence: 0, action: "cite", claims: [2], unknownClaims: [] },
      ],
      removed: [],
      modelCalls: 2,
    });
  });

  it.each([
    [
      "deletes it",
      { sentence: 1, action: "delete" as const, claims: [], text: "" },
      "repair",
    ],
    [
      "cites a claim that does not exist",
      { sentence: 1, action: "cite" as const, claims: [7], text: "" },
      "check",
    ],
    [
      "does not answer for it",
      { sentence: 9, action: "cite" as const, claims: [1], text: "" },
      "check",
    ],
  ])(
    "removes and records an uncited factual sentence when the repair %s",
    async (_, answer, by) => {
      const { run, checked, body } = await runWith({
        ...writing(
          "LFP lasts long [^1].\n\nSodium cells are cheaper. Heat hurts [^2].",
        ),
        repairSentences: async () => ({ repairs: [answer] }),
      });
      expect(body).toBe("LFP lasts long [^1].\n\nHeat hurts [^2].");
      expect(checked.removed).toEqual([
        { text: "Sodium cells are cheaper.", opening: false, by },
      ]);
      expect(run.view().citationCheck?.removed).toEqual(checked.removed);
    },
  );

  it("keeps a connective sentence and a sentence about the scope of the claims", async () => {
    const draft =
      "LFP lasts long [^1].\n\nGuidance varies:\n\n- One [^1]\n- Two [^2]\n\nThe claims give no figures for cold climates.";
    const { run, checked, body } = await runWith({
      ...writing(draft),
      classifySentences: verdicts("connective", "scope"),
    });
    expect(body).toBe(draft);
    expect(run.calls.repairSentences).toBe(0);
    expect(checked.uncited.map((s) => [s.text, s.verdict])).toEqual([
      ["Guidance varies:", "connective"],
      ["The claims give no figures for cold climates.", "scope"],
    ]);
    expect(checked.modelCalls).toBe(1);
  });

  it("gives an uncited opening answer its citations", async () => {
    const { checked, body } = await runWith({
      ...writing(
        "## Answer\n\nLFP batteries last a long time. They reach 3,000 cycles [^1].\n\n## Detail\n\nHeat hurts [^2].",
      ),
      repairSentences: async ({ sentences }) => {
        expect(sentences).toEqual([
          { text: "LFP batteries last a long time.", opening: true },
        ]);
        return {
          repairs: [{ sentence: 1, action: "cite", claims: [1, 2], text: "" }],
        };
      },
    });
    expect(body.split("\n\n")[1]).toBe(
      "LFP batteries last a long time [^1][^2]. They reach 3,000 cycles [^1].",
    );
    expect(checked.removed).toEqual([]);
  });

  it("records the removal of an opening answer that the repair could not cite", async () => {
    const { checked, body } = await runWith({
      ...writing("LFP batteries last forever.\n\nHeat hurts [^2]."),
      repairSentences: async () => ({ repairs: [] }),
    });
    expect(body).toBe("Heat hurts [^2].");
    expect(checked.repairs).toEqual([
      {
        sentence: 0,
        action: "none",
        claims: [],
        unknownClaims: [],
        text: null,
      },
    ]);
    expect(checked.removed).toEqual([
      { text: "LFP batteries last forever.", opening: true, by: "check" },
    ]);
  });

  it("keeps a cited rewrite and judges an uncited sentence of a rewrite again", async () => {
    const judged: string[][] = [];
    const { run, checked, body } = await runWith({
      ...writing(
        "LFP lasts long [^1]. LFP cells last 9,000 cycles and never fail.",
      ),
      classifySentences: async ({ sentences }) => {
        judged.push([...sentences]);
        return verdicts("fact")({ sentences });
      },
      repairSentences: async () => ({
        repairs: [
          {
            sentence: 1,
            action: "rewrite",
            claims: [],
            text: "LFP cells last about 3,000 cycles [^2][^8]. They never fail",
          },
        ],
      }),
    });
    expect(body).toBe(
      "LFP lasts long [^1]. LFP cells last about 3,000 cycles [^2].",
    );
    expect(judged).toEqual([
      ["LFP cells last 9,000 cycles and never fail."],
      ["They never fail."],
    ]);
    expect(run.calls.classifySentences).toBe(2);
    expect(checked).toMatchObject({
      repairs: [{ action: "rewrite", claims: [2], unknownClaims: [8] }],
      rewritten: [{ text: "They never fail.", verdict: "fact" }],
      removed: [{ text: "They never fail.", by: "check" }],
      modelCalls: 3,
    });
  });

  it.each([
    [
      "a one-word answer",
      "Is it safe [^1]? No. LFP cells are safe [^2].",
      "No.",
    ],
    [
      "a sentence that ends on a single capital",
      "People often lack vitamin D. Supplements help [^1].",
      "People often lack vitamin D.",
    ],
  ])("judges %s as its own sentence", async (_, draft, sentence) => {
    const judged: string[][] = [];
    await runWith({
      ...writing(draft),
      classifySentences: async ({ sentences }) => {
        judged.push([...sentences]);
        return verdicts("connective")({ sentences });
      },
    });
    expect(judged).toEqual([[sentence]]);
  });

  it.each([
    [
      "initials in a name",
      "A study by John F. Kennedy School found gains [^1].",
    ],
    ["a number abbreviation", "Model No. 5 lasts long [^1]."],
    ["an initial that opens the sentence", "J. Smith found gains [^1]."],
  ])("keeps %s inside one sentence", async (_, draft) => {
    const { run } = await runWith(writing(draft));
    expect(run.calls.classifySentences).toBe(0);
  });

  it("marks the first item of an opening list as the opening answer", async () => {
    const opening: boolean[][] = [];
    await runWith({
      ...writing("- LFP cells last very long.\n- They are safe [^1]."),
      classifySentences: verdicts("fact"),
      repairSentences: async ({ sentences }) => {
        opening.push(sentences.map((s) => s.opening));
        return { repairs: [] };
      },
    });
    expect(opening).toEqual([[true]]);
  });

  it("ends a rewrite that closes on a bracket, so it does not run into the next sentence", async () => {
    const judged: string[][] = [];
    const { body } = await runWith({
      ...writing(
        "LFP lasts long [^1]. LFP cells never fail. LFP cells are safe [^2].",
      ),
      classifySentences: async ({ sentences }) => {
        judged.push([...sentences]);
        return verdicts("fact")({ sentences });
      },
      repairSentences: async () => ({
        repairs: [
          {
            sentence: 1,
            action: "rewrite",
            claims: [],
            text: "LFP cells never fail (a vendor claim)",
          },
        ],
      }),
    });
    // The uncited rewrite is its own sentence, so the check judges it again
    // and removes it.
    expect(judged).toEqual([
      ["LFP cells never fail."],
      ["LFP cells never fail (a vendor claim)."],
    ]);
    expect(body).toBe("LFP lasts long [^1]. LFP cells are safe [^2].");
  });

  it("treats every sentence as a fact when the classify answer is malformed", async () => {
    const { checked, body } = await runWith({
      ...writing("LFP lasts long [^1]. Guidance varies."),
      classifySentences: async () => {
        throw new MalformedAnswer("classifySentences", "no object");
      },
    });
    expect(checked.uncited).toMatchObject([{ verdict: "fact" }]);
    expect(body).toBe("LFP lasts long [^1].");
  });

  it("puts every citation after the last word and before the closing period", async () => {
    const { body } = await runWith(
      writing(
        'A fact. [^1] Two facts.[^1] [^2] A quote "ends here." [^2]\n\n- An item [^1]\n- Mid [^1] and end. [^2]',
      ),
    );
    expect(body).toBe(
      'A fact [^1]. Two facts [^1][^2]. A quote "ends here." [^2]\n\n- An item [^1]\n- Mid [^1] and end [^2].',
    );
  });

  it("stores the check so that a replay shows it", async () => {
    const { run } = await runWith({
      ...writing("LFP lasts long [^1]. Sodium cells are cheaper."),
    });
    const replayed = replay(
      createView(run.view().runId, run.view().question),
      run.events,
    );
    expect(replayed.citationCheck).toEqual(run.view().citationCheck);
    expect(replayed.citationCheck?.removed).toHaveLength(1);
    const types = typesOf(run.events);
    expect(types.indexOf("report.checked")).toBe(
      types.indexOf("report.finished") - 1,
    );
  });
});
