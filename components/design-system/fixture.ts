import type { z } from "zod";
import { BUDGET } from "@/lib/research/budget";
import {
  Question,
  RunEvent,
  type RunEventBody,
  RunId,
} from "@/lib/research/events";
import {
  type BudgetUsage,
  createView,
  replay,
  type VerifiedClaim,
} from "@/lib/research/run-view";
import { type ActivityGroup, activityOf } from "@/lib/ui/activity";
import { type RunTotals, totalsOf } from "@/lib/ui/totals";

type Body = z.input<typeof RunEventBody>;

const QUERIES = [
  {
    subQuestion: "How many cycles do sodium-ion cells reach?",
    query: "sodium-ion battery cycle life grid storage",
  },
  {
    subQuestion: "What does a sodium-ion pack cost?",
    query: "sodium-ion pack cost per kWh 2026",
  },
  {
    subQuestion: "Which grid projects run on sodium-ion?",
    query: "sodium-ion grid storage project commissioned",
  },
] as const;

const PAPER = "https://journal.example.org/articles/sodium-ion-cycle-life";
const REPORT = "https://agency.example.org/reports/batteries-and-secure-energy";
const NEWS = "https://news.example.com/energy/sodium-ion-grid-storage";

// One round of a run that is still at work: a search of each outcome, a page that was
// read, one that failed and one that is open. Every web action went through Decodo.
const RUNNING: readonly Body[] = [
  { type: "run.started", limits: BUDGET },
  {
    type: "round.started",
    round: 1,
    queries: [...QUERIES],
    droppedQueries: [],
  },
  {
    type: "decodo.requested",
    call: 1,
    round: 1,
    endpoint: "google_search",
    input: QUERIES[0].query,
  },
  {
    type: "decodo.settled",
    call: 1,
    outcome: "ok",
    detail: null,
    durationMs: 1640,
  },
  {
    type: "search.finished",
    round: 1,
    query: QUERIES[0],
    outcome: {
      status: "ok",
      results: [
        {
          position: 1,
          title: "Cycle life of sodium-ion cells at grid scale",
          url: PAPER,
          snippet: "",
        },
        {
          position: 2,
          title: "Batteries and Secure Energy Transitions",
          url: REPORT,
          snippet: "",
        },
        {
          position: 3,
          title: "Sodium-ion batteries reach the grid",
          url: NEWS,
          snippet: "",
        },
      ],
    },
  },
  {
    type: "decodo.requested",
    call: 2,
    round: 1,
    endpoint: "google_search",
    input: QUERIES[1].query,
  },
  {
    type: "decodo.settled",
    call: 2,
    outcome: "ok",
    detail: null,
    durationMs: 1210,
  },
  {
    type: "search.finished",
    round: 1,
    query: QUERIES[1],
    outcome: { status: "ok", results: [] },
  },
  {
    type: "decodo.requested",
    call: 3,
    round: 1,
    endpoint: "google_search",
    input: QUERIES[2].query,
  },
  {
    type: "decodo.settled",
    call: 3,
    outcome: "failed",
    detail: "timeout",
    durationMs: 30000,
  },
  {
    type: "search.finished",
    round: 1,
    query: QUERIES[2],
    outcome: {
      status: "failed",
      failure: { kind: "timeout", detail: "no answer after 30 s" },
    },
  },
  {
    type: "select.finished",
    round: 1,
    picked: [PAPER, REPORT, NEWS],
    unknownNumbers: [],
    mapRequest: null,
  },
  {
    type: "reads.queued",
    round: 1,
    queue: [PAPER, REPORT, NEWS],
    skipped: [],
  },
  {
    type: "decodo.requested",
    call: 4,
    round: 1,
    endpoint: "universal",
    input: PAPER,
  },
  {
    type: "decodo.settled",
    call: 4,
    outcome: "ok",
    detail: null,
    durationMs: 2380,
  },
  {
    type: "page.read",
    round: 1,
    url: PAPER,
    title: "Cycle life of sodium-ion cells at grid scale",
    chars: 18420,
  },
  { type: "page.extracted", url: PAPER, label: "Paper", drafts: 2 },
  {
    type: "claim.verified",
    number: 1,
    url: PAPER,
    statement:
      "Sodium-ion cells kept 80% of their capacity after 4,000 cycles.",
    quote:
      "the cells retained 80% of their initial capacity after 4,000 cycles at 25 °C",
  },
  {
    type: "claim.dropped",
    url: PAPER,
    statement:
      "Sodium-ion packs already cost less than lithium iron phosphate.",
    quote: "pack costs are expected to fall below those of LFP",
    failed: "V2",
    reason: "The quote states an expectation, not a present cost.",
  },
  {
    type: "decodo.requested",
    call: 5,
    round: 1,
    endpoint: "universal",
    input: REPORT,
  },
  {
    type: "decodo.settled",
    call: 5,
    outcome: "failed",
    detail: "http-status",
    durationMs: 940,
  },
  {
    type: "page.failed",
    round: 1,
    url: REPORT,
    failure: { kind: "http-status", detail: "403" },
  },
  {
    type: "decodo.requested",
    call: 6,
    round: 1,
    endpoint: "universal",
    input: NEWS,
  },
];

const START = Date.UTC(2026, 10, 17, 9, 0, 0);

function eventsOf(bodies: readonly Body[]): RunEvent[] {
  return bodies.map((body, index) =>
    RunEvent.parse({
      ...body,
      seq: index + 1,
      at: new Date(START + index * 1500).toISOString(),
    }),
  );
}

export type RunFixture = {
  budget: BudgetUsage;
  totals: RunTotals;
  /** The round while the run is at work. Its last page read is still open. */
  running: readonly ActivityGroup[];
  /** What the same run shows once it is cancelled: the open row, stopped, and the end. */
  stopped: readonly ActivityGroup[];
  claim: VerifiedClaim;
};

/** A run made of real events, put through the reducers the run page uses. */
export function runFixture(): RunFixture {
  const fresh = () =>
    createView(
      RunId.parse("design-system"),
      Question.parse("Are sodium-ion batteries ready for grid storage?"),
    );
  const running = eventsOf(RUNNING);
  const cancelled = eventsOf([
    ...RUNNING,
    { type: "run.finished", end: { status: "cancelled" } },
  ]);
  const view = replay(fresh(), running);
  const after = activityOf(replay(fresh(), cancelled), cancelled);
  const [claim] = view.verified;
  if (!claim) throw new Error("the fixture run verified no claim");
  return {
    budget: view.budget,
    totals: totalsOf(view),
    running: activityOf(view, running),
    stopped: after
      .map((group) => ({
        ...group,
        rows: group.rows.filter(
          (row) => row.state === "stopped" || row.kind === "end",
        ),
      }))
      .filter((group) => group.rows.length > 0),
    claim,
  };
}
