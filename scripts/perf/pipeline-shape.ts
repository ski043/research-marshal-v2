import type { WebActions } from "@/lib/research/budget";
import { defaultModel, defaultWeb, PAGE_TEXT } from "@/lib/research/fakes";
import type { ModelSteps } from "@/lib/research/model-config";
import { runPipeline } from "@/lib/research/pipeline";
import { testRun } from "@/lib/research/testing";

// Runs the real pipeline on the test fakes with a fixed delay per web call and per model
// call. It measures the pipeline's own scheduling, not the network or the model.

export type ShapeConfig = {
  delayMs: number;
  queries: number;
  pages: number;
  claimsPerPage: number;
};

export type ShapeSample = {
  wallMs: number;
  peaks: Record<string, number>;
  calls: Record<string, number>;
};

const QUOTES = [
  "LFP cells last about 3,000 cycles.",
  "Heat shortens their life.",
  "Battery life",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function meter() {
  const active: Record<string, number> = {};
  const peaks: Record<string, number> = {};
  const calls: Record<string, number> = {};
  const enter = (name: string) => {
    active[name] = (active[name] ?? 0) + 1;
    calls[name] = (calls[name] ?? 0) + 1;
    peaks[name] = Math.max(peaks[name] ?? 0, active[name]);
  };
  const leave = (name: string) => {
    active[name] = (active[name] ?? 1) - 1;
  };
  return { peaks, calls, enter, leave };
}

export type Gate = (name: string) => Promise<() => void>;

// A gate wraps each delayed call; the default lets every call through at once.
const open: Gate = async () => () => {};

export async function measureShape(
  config: ShapeConfig,
  gate: Gate = open,
): Promise<ShapeSample> {
  const { delayMs } = config;
  const m = meter();
  const delayed =
    <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const release = await gate(name);
      m.enter(name);
      try {
        await sleep(delayMs);
        return await fn(...args);
      } finally {
        m.leave(name);
        release();
      }
    };

  const model: ModelSteps = {
    plan: delayed("plan", async () =>
      Array.from({ length: config.queries }, (_, i) => ({
        subQuestion: `Part ${i + 1}?`,
        query: `lfp part ${i + 1}`,
      })),
    ),
    select: delayed("select", async ({ candidates }) => ({
      picks: candidates.slice(0, config.pages).map((c) => c.number),
      map: null,
    })),
    pickFromMap: delayed("pickFromMap", defaultModel.pickFromMap),
    extract: delayed("extract", async () => ({
      label: "Reference",
      claims: QUOTES.slice(0, config.claimsPerPage).map((quote) => ({
        statement: quote,
        quote,
      })),
    })),
    supports: delayed("supports", defaultModel.supports),
    checkGaps: delayed("checkGaps", defaultModel.checkGaps),
    // The fake report cites every sentence, so the citation check makes no call.
    classifySentences: defaultModel.classifySentences,
    repairSentences: defaultModel.repairSentences,
    writeReport: async function* (input) {
      const release = await gate("writeReport");
      m.enter("writeReport");
      try {
        await sleep(delayMs);
        yield* defaultModel.writeReport(input);
      } finally {
        m.leave("writeReport");
        release();
      }
    },
  };
  const web: WebActions = {
    search: delayed("search", defaultWeb.search),
    read: delayed("read", async () => ({ status: "ok", markdown: PAGE_TEXT })),
    map: delayed("map", defaultWeb.map),
  };

  const run = testRun({ model, web });
  const started = performance.now();
  const end = await runPipeline(run.deps);
  const wallMs = performance.now() - started;
  if (end.status !== "completed") {
    throw new Error(`the fake run ended ${JSON.stringify(end)}`);
  }
  return { wallMs, peaks: m.peaks, calls: m.calls };
}

// plan, search, select, read, extract, V2, gap check, report: one delay each when the
// searches, the reads and the checks run side by side.
export const CRITICAL_PATH_DELAYS = 8;

export function expectedPeaks(config: ShapeConfig): Record<string, number> {
  return {
    search: config.queries,
    read: config.pages,
    extract: config.pages,
    supports: config.pages * config.claimsPerPage,
  };
}
