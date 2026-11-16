import type { Envelope, StoredRun } from "./stored-run";

// Builds small runs for the tests: one round, two read pages, two verified claims.

export const PAGE_A =
  "# Battery life\n\nLFP cells last about **3,000 cycles**.[1](#ref-1) Heat shortens their life.";
export const PAGE_B =
  "Calendar aging limits life [\\[2\\]](#cite_note-2) however few cycles are used.";

export const URL_A = "https://example.org/a";
export const URL_B = "https://www.example.com/b";

export function filler(words: number): string {
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}

export const REPORT = `LFP cells last about 3,000 cycles [^1]. Calendar aging limits life however few cycles are used [^2].

## Detail

Padding ${filler(260)} [^1].

## Sources

- [Battery life](${URL_A}) · example.org · Reference · [^1]
- [Aging](${URL_B}) · example.com · Blog · [^2]
`;

type Body = { type: string; [key: string]: unknown };

export function syntheticRun(
  options: {
    status?: string;
    report?: string | null;
    edit?: (bodies: Body[]) => Body[];
    pages?: Record<string, string>;
  } = {},
): StoredRun {
  const status = options.status ?? "COMPLETED";
  const report = options.report === undefined ? REPORT : options.report;
  const bodies: Body[] = [
    { type: "run.started", limits: {} },
    { type: "round.started", round: 1, queries: [{ query: "lfp life" }] },
    {
      type: "decodo.requested",
      call: 1,
      round: 1,
      endpoint: "google_search",
      input: "lfp life",
    },
    {
      type: "decodo.settled",
      call: 1,
      outcome: "ok",
      detail: "2 results",
      durationMs: 100,
    },
    {
      type: "search.finished",
      round: 1,
      query: { query: "lfp life" },
      outcome: { status: "ok", results: [{ url: URL_A }, { url: URL_B }] },
    },
    { type: "select.finished", round: 1, picked: [URL_A, URL_B] },
    { type: "reads.planned", round: 1, granted: [URL_A, URL_B], refused: [] },
    {
      type: "decodo.requested",
      call: 2,
      round: 1,
      endpoint: "universal",
      input: URL_A,
    },
    {
      type: "decodo.requested",
      call: 3,
      round: 1,
      endpoint: "universal",
      input: URL_B,
    },
    {
      type: "decodo.settled",
      call: 2,
      outcome: "ok",
      detail: null,
      durationMs: 100,
    },
    {
      type: "page.read",
      round: 1,
      url: URL_A,
      title: "Battery life",
      chars: PAGE_A.length,
    },
    {
      type: "decodo.settled",
      call: 3,
      outcome: "ok",
      detail: null,
      durationMs: 100,
    },
    {
      type: "page.read",
      round: 1,
      url: URL_B,
      title: "Aging",
      chars: PAGE_B.length,
    },
    { type: "page.extracted", url: URL_A, label: "Reference", drafts: 2 },
    { type: "page.extracted", url: URL_B, label: "Blog", drafts: 1 },
    {
      type: "claim.verified",
      number: 1,
      url: URL_A,
      statement: "LFP lasts.",
      quote: "LFP cells last about 3,000 cycles.",
    },
    {
      type: "claim.dropped",
      url: URL_A,
      statement: "Heat helps.",
      quote: "Heat shortens their life.",
      failed: "V2",
      reason: "The quote says the opposite.",
    },
    {
      type: "claim.verified",
      number: 2,
      url: URL_B,
      statement: "Calendar aging.",
      quote: "Calendar aging limits life however few cycles are used.",
    },
    { type: "gap.checked", round: 1, answered: true },
    ...(report === null
      ? []
      : [
          { type: "report.delta", text: report.slice(0, 80) },
          {
            type: "report.finished",
            writtenBy: "model",
            markdown: report,
            cited: [1, 2],
          },
        ]),
    {
      type: "run.finished",
      end:
        status === "COMPLETED"
          ? { status: "completed", stoppedBy: "answered" }
          : { status: status.toLowerCase() },
    },
  ];
  const edited = options.edit ? options.edit(bodies) : bodies;
  const events: Envelope[] = edited.map((body, i) => ({
    ...body,
    seq: i + 1,
    at: 1_000 * (i + 1),
  }));
  return {
    run: {
      id: "synthetic",
      question: "How long do LFP batteries last?",
      status,
      createdAt: "2026-11-16T10:00:00.000Z",
      finishedAt: "2026-11-16T10:01:00.000Z",
    },
    events,
    pages: new Map(
      Object.entries(options.pages ?? { [URL_A]: PAGE_A, [URL_B]: PAGE_B }),
    ),
  };
}
