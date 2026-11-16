import { readFileSync } from "node:fs";
import { expect, vi } from "vitest";
import { BUDGET, meterWeb, type WebActions } from "./budget";
import {
  PageUrl,
  Question,
  type RunEvent,
  RunId,
  SearchOutcome,
} from "./events";
import { MODEL_CONFIG, type ModelSteps } from "./model-config";
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
  classifySentences: async ({ sentences }) => ({
    verdicts: sentences.map((_, i) => ({
      sentence: i + 1,
      verdict: "fact",
      reason: "It states a fact.",
    })),
  }),
  repairSentences: async ({ sentences }) => ({
    repairs: sentences.map((_, i) => ({
      sentence: i + 1,
      action: "delete",
      claims: [],
      text: "",
    })),
  }),
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
    classifySentences: 0,
    repairSentences: 0,
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
    classifySentences: counted("classifySentences", m.classifySentences),
    repairSentences: counted("repairSentences", m.repairSentences),
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
      `read attempts in round ${round.round}`,
    ).toBeLessThanOrEqual(BUDGET.readAttemptsPerRound);
    expect(
      events.filter((e) => e.type === "page.read" && e.round === round.round)
        .length,
      `pages read in round ${round.round}`,
    ).toBeLessThanOrEqual(BUDGET.readsPerRound);
  }
  expect(
    requested.filter((e) => e.endpoint === "map").length,
    "maps",
  ).toBeLessThanOrEqual(BUDGET.mapsPerRun);
  const reads = requested.filter((e) => e.endpoint === "universal");
  const plain = reads.filter((e) => !e.rendered).map((e) => e.input);
  expect(new Set(plain).size, "no URL read twice").toBe(plain.length);
  const rendered = reads.filter((e) => e.rendered).map((e) => e.input);
  expect(new Set(rendered).size, "no URL rendered twice").toBe(rendered.length);
  for (const url of rendered) {
    expect(plain, "a rendered read retries a plain read").toContain(url);
  }
}

export type HostilePage =
  | "page-close-tag"
  | "v2-injection-quote"
  | "quote-giant";

function hostileFixture(name: string): string {
  return readFileSync(
    new URL(`./fixtures/hostile/${name}`, import.meta.url),
    "utf8",
  );
}

export function hostilePage(name: HostilePage): string {
  return hostileFixture(`${name}.md`);
}

export function hostileSearch(): SearchOutcome {
  return SearchOutcome.parse(
    JSON.parse(hostileFixture("select-hostile-snippet.json")),
  );
}

export function outsideWebData(text: string): string {
  return text.replace(/<web_data>[\s\S]*?<\/web_data>/g, "");
}

export type AnthropicRequest = {
  max_tokens: number;
  system: string;
  prompt: string;
  stream: boolean;
};

type AnthropicAnswer = { text: string; stopReason?: "end_turn" | "max_tokens" };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => part?.text ?? "").join("\n");
}

function sse(answer: AnthropicAnswer): string {
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: MODEL_CONFIG.extract.model,
        content: [],
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: answer.text },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: answer.stopReason ?? "end_turn" },
      usage: { output_tokens: 10 },
    },
    { type: "message_stop" },
  ];
  return events
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");
}

// Stubs the Anthropic Messages API under the real AI SDK, so a test sees the
// request that a model step sends and controls the answer.
export function fakeAnthropic(
  answer: (request: AnthropicRequest) => AnthropicAnswer,
) {
  const requests: AnthropicRequest[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const request: AnthropicRequest = {
      max_tokens: body.max_tokens,
      system: textOf(body.system),
      prompt: body.messages
        .map((m: { content: unknown }) => textOf(m.content))
        .join("\n"),
      stream: body.stream === true,
    };
    requests.push(request);
    const reply = answer(request);
    if (request.stream) {
      return new Response(sse(reply), {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: MODEL_CONFIG.extract.model,
      content: [{ type: "text", text: reply.text }],
      stop_reason: reply.stopReason ?? "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    });
  });
  return { requests };
}
