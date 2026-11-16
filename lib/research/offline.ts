import { setTimeout as sleep } from "node:timers/promises";
import { BUDGET, type WebActions } from "./budget";
import type { PlannedQuery } from "./events";
import type { RunPorts } from "./index";
import type { ModelSteps } from "./model-config";
import { defaultModel, defaultWeb } from "./testing";

export type OfflineScenario = {
  name: string;
  /** The end state the scenario promises, with the PRD requirements it shows. */
  promise: string;
  question: string;
  web?: Partial<WebActions>;
  model?: Partial<ModelSteps>;
};

const query = (q: string): PlannedQuery => ({
  subQuestion: `What does "${q}" find?`,
  query: q,
});

const writeReport: ModelSteps["writeReport"] = async function* ({ claims }) {
  yield "# Answer\n\n";
  for (const claim of claims) {
    const words = `${claim.statement} [^${claim.number}]`.split(" ");
    for (const [i, word] of words.entries()) yield i === 0 ? word : ` ${word}`;
    yield "\n\n";
  }
};

const SCENARIO_LIST: readonly OfflineScenario[] = [
  {
    name: "completed",
    promise:
      "Completes in round 1 (stopped by answered, B4) with verified claims and a report that the model wrote.",
    question: "How long do LFP batteries last?",
    model: { writeReport },
  },
  {
    name: "failures",
    promise:
      "Completes with one failed page and one skipped page (F1), one search without results and one failed search (F2).",
    question: "How long do LFP batteries last when the web fails?",
    model: {
      plan: async () => [
        query("lfp cycle life"),
        query("lfp obscure term"),
        query("lfp aging heat"),
      ],
      writeReport,
    },
    web: {
      search: async (q) => {
        if (q === "lfp obscure term") return { status: "ok", results: [] };
        if (q === "lfp aging heat") {
          return {
            status: "failed",
            failure: { kind: "timeout", detail: "no answer within 150 s" },
          };
        }
        return defaultWeb.search(q);
      },
      read: async (url) =>
        url.endsWith("/2")
          ? {
              status: "failed",
              failure: { kind: "http-status", detail: "HTTP 404" },
            }
          : defaultWeb.read(url),
    },
  },
  {
    name: "dropped",
    promise:
      "Completes with one verified claim, one claim dropped for V1 and one dropped for V2 (F3, V3).",
    question: "How long do LFP batteries last, with bad claims?",
    model: {
      select: async ({ candidates }) => ({
        picks: candidates.slice(0, 1).map((c) => c.number),
        map: null,
      }),
      extract: async () => ({
        label: "Reference",
        claims: [
          {
            statement: "LFP cells last about 3,000 cycles.",
            quote: "LFP cells last about 3,000 cycles.",
          },
          {
            statement: "LFP cells last about 5,000 cycles.",
            quote: "LFP cells last about 5,000 cycles.",
          },
          {
            statement: "Heat makes LFP cells last longer.",
            quote: "Heat shortens their life.",
          },
        ],
      }),
      supports: async ({ statement }) =>
        statement.includes("longer")
          ? { supported: false, reason: "The quote says heat shortens life." }
          : { supported: true, reason: "The quote says so." },
      writeReport,
    },
  },
  {
    name: "budget",
    promise:
      "Runs every round the budget allows (B1), reads at most the round limit with the rest skipped over the budget (B2), maps once (B3), and still writes the report (B5).",
    question: "How long do LFP batteries last, asked without end?",
    model: {
      plan: async () =>
        Array.from({ length: BUDGET.queriesPerRound + 1 }, (_, i) =>
          query(`lfp plan ${i + 1}`),
        ),
      select: async ({ candidates, mapAvailable }) => ({
        picks: candidates.map((c) => c.number),
        map: mapAvailable ? { result: 1, need: "the datasheet" } : null,
      }),
      checkGaps: async ({ searched }) => ({
        answered: false,
        missing: ["the cost per cycle"],
        queries: [1, 2, 3].map((i) => query(`lfp gap ${searched.length + i}`)),
      }),
      writeReport,
    },
  },
  {
    name: "no-claims",
    promise:
      "Completes with no verified claim (stopped by dead-end); code writes a report that says so and lists the searches (R6).",
    question: "How long do LFP batteries last, with no quotable page?",
    model: {
      extract: async () => ({
        label: "Blog",
        claims: [
          {
            statement: "LFP cells last 10,000 cycles.",
            quote: "LFP cells last about 10,000 cycles.",
          },
        ],
      }),
      checkGaps: async () => ({
        answered: false,
        missing: ["How long LFP cells last"],
        queries: [],
      }),
    },
  },
];

export const SCENARIOS: ReadonlyMap<string, OfflineScenario> = new Map(
  SCENARIO_LIST.map((scenario) => [scenario.name, scenario]),
);

export function offlineQuestion(scenario: OfflineScenario): string {
  return `[offline:${scenario.name}] ${scenario.question}`;
}

/** The fake web and model of a scenario. With `paceMs`, each web call, model step and report chunk waits that long first. */
export function offlinePorts(scenario: OfflineScenario, paceMs = 0): RunPorts {
  const w = { ...defaultWeb, ...scenario.web };
  const m = { ...defaultModel, ...scenario.model };
  const pace = async () => {
    if (paceMs > 0) await sleep(paceMs);
  };
  const paced =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await pace();
      return fn(...args);
    };
  return {
    web: { search: paced(w.search), read: paced(w.read), map: paced(w.map) },
    model: {
      plan: paced(m.plan),
      select: paced(m.select),
      pickFromMap: paced(m.pickFromMap),
      extract: paced(m.extract),
      supports: paced(m.supports),
      checkGaps: paced(m.checkGaps),
      classifySentences: paced(m.classifySentences),
      repairSentences: paced(m.repairSentences),
      writeReport: async function* (input) {
        for await (const chunk of m.writeReport(input)) {
          await pace();
          yield chunk;
        }
      },
    },
  };
}
