import type { RunView } from "@/lib/research/run-view";

/** What the whole run did so far. The budget meters count one round at a time. */
export type RunTotals = {
  searches: number;
  pagesRead: number;
  pagesFailed: number;
  pagesSkipped: number;
  claimsVerified: number;
  claimsDropped: number;
};

export function totalsOf(view: RunView): RunTotals {
  const pages = Object.values(view.pages);
  const inState = (kind: "read" | "failed" | "skipped") =>
    pages.filter((page) => page.state.kind === kind).length;
  return {
    searches: view.rounds.reduce(
      (sum, round) => sum + round.searches.length,
      0,
    ),
    pagesRead: inState("read"),
    pagesFailed: inState("failed"),
    pagesSkipped: inState("skipped"),
    claimsVerified: view.verified.length,
    claimsDropped: view.dropped.length,
  };
}
