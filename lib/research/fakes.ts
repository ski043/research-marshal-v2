import type { WebActions } from "./budget";
import { PageUrl } from "./events";
import type { ModelSteps } from "./model-config";

// The fake web and model of the tests and the offline scenarios. No test framework here,
// so the Next.js app can load them through `offline.ts`.

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
