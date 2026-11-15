import { expect } from "vitest";
import { BUDGET, meterWeb, type WebActions } from "./budget";
import { PageUrl, Question, type RunEvent, RunId } from "./events";
import type { ModelSteps } from "./model-config";
import type { PipelineDeps } from "./pipeline";
import { createRunLog } from "./run-log";

export const PAGE_TEXT =
  "# Battery life\n\nLFP cells last about 3,000 cycles. Heat shortens their life.";

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export const defaultWeb: WebActions = {
  search: async (query) => ({
    status: "ok",
    results: [1, 2, 3].map((n) => ({
      position: n,
      title: `${query} result ${n}`,
      url: PageUrl.parse(`https://example.org/${slug(query)}/${n}`),
      snippet: `About ${query}`,
    })),
  }),
  read: async () => ({ status: "ok", markdown: PAGE_TEXT }),
  map: async (site) => ({
    status: "ok",
    urls: [1, 2, 3].map((n) => PageUrl.parse(`${site}/mapped/${n}`)),
  }),
};

export const defaultModel: ModelSteps = {
  plan: async () => [
    { subQuestion: "How long do LFP cells last?", query: "lfp cycle life" },
    { subQuestion: "What shortens their life?", query: "lfp aging heat" },
  ],
  select: async ({ candidates }) => ({
    picks: candidates.slice(0, 2).map((c) => c.number),
    map: null,
  }),
  pickFromMap: async () => ({ picks: [1] }),
  extract: async () => ({
    label: "Reference",
    claims: [
      {
        statement: "LFP cells last about 3,000 cycles.",
        quote: "LFP cells last about 3,000 cycles.",
      },
    ],
  }),
  supports: async () => ({ supported: true, reason: "The quote says so." }),
  checkGaps: async () => ({ answered: true, missing: [], queries: [] }),
  writeReport: async function* ({ claims }) {
    yield "LFP cells last long";
    yield ` [^${claims[0]?.number ?? 1}].`;
  },
};

type CallName = keyof ModelSteps | keyof WebActions;

export function testRun(script: {
  model?: Partial<ModelSteps>;
  web?: Partial<WebActions>;
  question?: string;
}) {
  const calls: Record<CallName, number> = {
    plan: 0,
    select: 0,
    pickFromMap: 0,
    extract: 0,
    supports: 0,
    checkGaps: 0,
    writeReport: 0,
    search: 0,
    read: 0,
    map: 0,
  };
  const m = { ...defaultModel, ...script.model };
  const w = { ...defaultWeb, ...script.web };
  const counted =
    <A extends unknown[], R>(name: CallName, fn: (...args: A) => R) =>
    (...args: A): R => {
      calls[name] += 1;
      return fn(...args);
    };
  const model: ModelSteps = {
    plan: counted("plan", m.plan),
    select: counted("select", m.select),
    pickFromMap: counted("pickFromMap", m.pickFromMap),
    extract: counted("extract", m.extract),
    supports: counted("supports", m.supports),
    checkGaps: counted("checkGaps", m.checkGaps),
    writeReport: counted("writeReport", m.writeReport),
  };
  const web: WebActions = {
    search: counted("search", w.search),
    read: counted("read", w.read),
    map: counted("map", w.map),
  };

  const events: RunEvent[] = [];
  const pages = new Map<string, string>();
  const controller = new AbortController();
  const log = createRunLog({
    runId: RunId.parse("test-run"),
    question: Question.parse(
      script.question ?? "How long do LFP batteries last?",
    ),
    persist: async (event) => {
      events.push(event);
    },
    now: () => new Date("2026-11-15T21:00:00.000Z"),
  });
  let clock = 0;
  const deps: PipelineDeps = {
    model,
    web: meterWeb({
      web,
      emit: log.emit,
      signal: controller.signal,
      now: () => (clock += 10),
    }),
    log,
    savePage: async (url, markdown) => {
      pages.set(url, markdown);
    },
    signal: controller.signal,
  };
  return {
    deps,
    events,
    pages,
    calls,
    view: () => log.view,
    cancel: () => controller.abort(),
  };
}

export function expectBudgetHeld(events: readonly RunEvent[]): void {
  const rounds = events.filter((e) => e.type === "round.started");
  expect(rounds.length, "rounds").toBeLessThanOrEqual(BUDGET.rounds);
  const requested = events.flatMap((e) =>
    e.type === "decodo.requested" ? [e] : [],
  );
  for (const round of rounds) {
    const inRound = requested.filter((e) => e.round === round.round);
    const count = (endpoint: string) =>
      inRound.filter((e) => e.endpoint === endpoint).length;
    expect(
      count("google_search"),
      `searches in round ${round.round}`,
    ).toBeLessThanOrEqual(BUDGET.queriesPerRound);
    expect(
      count("universal"),
      `reads in round ${round.round}`,
    ).toBeLessThanOrEqual(BUDGET.readsPerRound);
  }
  expect(
    requested.filter((e) => e.endpoint === "map").length,
    "maps",
  ).toBeLessThanOrEqual(BUDGET.mapsPerRun);
  const reads = requested
    .filter((e) => e.endpoint === "universal")
    .map((e) => e.input);
  expect(new Set(reads).size, "no URL read twice").toBe(reads.length);
}
