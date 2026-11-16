import {
  cancelRun,
  followRun,
  loadRun,
  type RunPorts,
  startRun,
} from "@/lib/research";
import { Question, type ReadSkip, type RunEvent } from "@/lib/research/events";
import type { RunView, SkipReason } from "@/lib/research/run-view";
import {
  EXIT,
  exitCodeOf,
  parseResearchArgs,
  summaryLine,
  USAGE,
} from "./research-args";

function usage(error: string): never {
  console.error(`${error}\n\n${USAGE}`);
  process.exit(EXIT.usage);
}

const cli = parseResearchArgs(process.argv.slice(2));
if (!cli.ok) usage(cli.error);
let questionText = cli.args.question;
let ports: RunPorts | undefined;
if (cli.args.offline) {
  // Imported only here so a live run never loads the fakes.
  const offline = await import("@/lib/research/offline");
  const scenario = offline.SCENARIOS.get(cli.args.offline.scenario);
  if (!scenario) {
    usage(
      `Unknown scenario "${cli.args.offline.scenario}". Scenarios:\n${[
        ...offline.SCENARIOS.values(),
      ]
        .map((s) => `  ${s.name.padEnd(10)} ${s.promise}`)
        .join("\n")}`,
    );
  }
  ports = offline.offlinePorts(scenario, cli.args.offline.paceMs);
  questionText ||= offline.offlineQuestion(scenario);
}
const parsed = Question.safeParse(questionText);
if (!parsed.success) usage("The question must have 1 to 2000 characters.");

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const startedAt = performance.now();
let reportOpen = false;

function line(text: string): void {
  if (reportOpen) {
    process.stdout.write("\n");
    reportOpen = false;
  }
  console.log(text);
}

const SKIP_REASON: Record<ReadSkip | SkipReason, string> = {
  "not-chosen": "not selected",
  "over-budget": "over the budget",
  "already-read": "already read",
  "site-refused": "site refused",
  "run-ended": "run ended",
};

function skipCounts(skipped: readonly { reason: ReadSkip }[]): string {
  const counts = new Map<ReadSkip, number>();
  for (const { reason } of skipped) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts]
    .map(([reason, n]) => `, ${n} skipped: ${SKIP_REASON[reason]}`)
    .join("");
}

function describeStep(event: RunEvent): string[] {
  switch (event.type) {
    case "run.started": {
      const l = event.limits;
      return [
        `Run started. Budget: ${l.rounds} rounds, ${l.queriesPerRound} searches, ${l.readsPerRound} page reads and ${l.readAttemptsPerRound} read attempts per round, ${l.mapsPerRun} map per run.`,
      ];
    }
    case "round.started":
      return [
        `\nRound ${event.round}: ${event.queries.length} searches`,
        ...event.droppedQueries.map(
          (q) => `  Dropped query over the budget: "${q.query}"`,
        ),
      ];
    case "decodo.requested":
      return [
        `  Decodo #${event.call} ${event.endpoint}${event.rendered ? " (rendered)" : ""} ${event.input}`,
      ];
    case "decodo.settled":
    case "report.delta":
      return [];
    case "search.finished": {
      const { outcome } = event;
      const result =
        outcome.status === "failed"
          ? `failed (${outcome.failure.kind}: ${outcome.failure.detail})`
          : outcome.results.length === 0
            ? "no results"
            : `${outcome.results.length} results`;
      return [`  Search "${event.query.query}": ${result}`];
    }
    case "select.finished":
      return [
        `  Select chose ${event.picked.length} pages`,
        ...(event.unknownNumbers.length > 0
          ? [
              `  Select named unknown numbers: ${event.unknownNumbers.join(", ")}`,
            ]
          : []),
        ...(event.mapRequest
          ? [
              `  Select asked to map ${event.mapRequest.site}: ${event.mapRequest.need}`,
            ]
          : []),
      ];
    case "map.finished":
      return [
        event.outcome.status === "ok"
          ? `  Map of ${event.site}: ${event.outcome.listed} URLs, picked ${event.outcome.picked.length}`
          : `  Map of ${event.site} failed (${event.outcome.failure.kind}: ${event.outcome.failure.detail})`,
      ];
    case "reads.planned": {
      const over = event.refused.filter((r) => r.reason === "over-budget");
      return [
        `  Reads: ${event.granted.length} granted, ${over.length} skipped over the budget, ${event.refused.length - over.length} already read`,
      ];
    }
    case "reads.queued":
      return [
        `  Reads: ${event.queue.length} pages in reading order${skipCounts(event.skipped)}`,
      ];
    case "reads.finished":
      return event.skipped.length > 0
        ? [`  Reads done${skipCounts(event.skipped)}`]
        : [];
    case "page.read":
      return [`  Read ${event.url} (${event.chars} chars) "${event.title}"`];
    case "page.failed":
      return [
        `  Failed page ${event.url}: ${event.failure.kind}: ${event.failure.detail}`,
      ];
    case "page.extracted":
      return [
        `  Extracted ${event.drafts} claims from ${event.url} [${event.label}]`,
      ];
    case "page.extract-failed":
      return [`  Extract failed for ${event.url}: ${event.message}`];
    case "claim.verified":
      return [`  Verified [^${event.number}] ${event.statement}`];
    case "claim.dropped":
      return [
        `  Dropped (${event.failed}: ${event.reason}) ${event.statement}`,
      ];
    case "gap.checked":
      return event.answered
        ? ["  Gap check: the claims answer the question"]
        : [
            `  Gap check: open parts: ${event.missing.join("; ") || "none named"}`,
            `  Next queries: ${event.nextQueries.length}`,
          ];
    case "run.error":
      return [`\nRun error in step "${event.step}": ${event.message}`];
    case "report.finished":
      return [
        `\nReport finished, written by ${event.writtenBy}. Cited claims: ${event.cited.length}. Removed citations: ${event.removedCitations.join(", ") || "none"}.`,
      ];
    case "run.finished":
      return [`Run finished: ${event.end.status}`];
  }
}

function printStep(event: RunEvent): void {
  if (event.type === "report.delta") {
    if (!reportOpen) {
      line("\nWriting the report:");
      reportOpen = true;
    }
    process.stdout.write(event.text);
    return;
  }
  for (const text of describeStep(event)) line(text);
}

function printGroups(
  title: string,
  entries: readonly { url: string; group: string }[],
): void {
  const groups = Map.groupBy(entries, (entry) => entry.group);
  for (const [group, members] of groups) {
    console.log(`${title}, ${group}: ${members.length}`);
    for (const { url } of members) console.log(`  ${url}`);
  }
}

function printPages(view: RunView): void {
  const pages = Object.values(view.pages);
  const read = pages.filter((p) => p.state.kind === "read").length;
  const failed = pages.flatMap((p) =>
    p.state.kind === "failed"
      ? [{ url: p.url, group: p.state.failure.kind }]
      : [],
  );
  const skipped = pages.flatMap((p) =>
    p.state.kind === "skipped"
      ? [{ url: p.url, group: SKIP_REASON[p.state.reason] }]
      : [],
  );
  console.log(
    `\nPages: ${pages.length} found, ${read} read, ${failed.length} failed, ${skipped.length} skipped.`,
  );
  printGroups("Failed", failed);
  printGroups("Skipped", skipped);
}

function printSummary(view: RunView): void {
  console.log("\n===== REPORT =====");
  console.log(
    view.report?.kind === "final"
      ? view.report.markdown.trimEnd()
      : `(no report: the run is ${view.status})`,
  );
  console.log("===== END REPORT =====");

  console.log("\nDecodo calls:");
  console.table(
    view.decodoCalls.map((c) => ({
      call: c.call,
      round: c.round,
      endpoint: c.rendered ? `${c.endpoint} (rendered)` : c.endpoint,
      input: c.input,
      outcome: c.outcome,
      detail: c.detail,
      duration: c.durationMs === null ? null : seconds(c.durationMs),
    })),
  );

  console.log(`\nDropped claims: ${view.dropped.length}`);
  for (const claim of view.dropped) {
    console.log(`- [${claim.failed}] ${claim.statement}`);
    console.log(`  Quote: "${claim.quote}"`);
    console.log(`  Reason: ${claim.reason}`);
    console.log(`  Page: ${claim.url}`);
  }

  printPages(view);

  const { budget } = view;
  const attempts = view.decodoCalls.filter((c) => c.endpoint === "universal");
  const reads = attempts.filter((c) => c.outcome === "ok");
  const searches = view.decodoCalls.filter(
    (c) => c.endpoint === "google_search",
  ).length;
  console.log(
    `\nBudget used: ${budget.rounds} of ${budget.limits?.rounds ?? "?"} rounds, ${searches} searches, ${reads.length} page reads in ${attempts.length} read attempts, ${budget.maps} of ${budget.limits?.mapsPerRun ?? "?"} maps.`,
  );
  for (const round of view.rounds) {
    const inRound = (calls: typeof attempts) =>
      calls.filter((c) => c.round === round.no).length;
    console.log(
      `  Round ${round.no}: ${inRound(reads)} of ${budget.limits?.readsPerRound ?? "?"} page reads in ${inRound(attempts)} of ${budget.limits?.readAttemptsPerRound ?? "?"} attempts`,
    );
  }
  console.log(
    `Verified claims: ${view.verified.length}. Dropped claims: ${view.dropped.length}.`,
  );
  if (view.error) {
    console.log(
      `Saved error: step "${view.error.step}": ${view.error.message}`,
    );
  }
  const end = view.end;
  console.log(
    `Run status: ${view.status}${end?.status === "completed" ? ` (${end.stoppedBy})` : end?.status === "failed" ? ` (${end.message})` : ""}`,
  );
  console.log(`Wall time: ${seconds(performance.now() - startedAt)}`);
}

const run = await startRun(parsed.data, ports);
console.log(`Run ${run.runId}: ${parsed.data}`);

let interrupts = 0;
process.on("SIGINT", () => {
  interrupts += 1;
  if (interrupts > 1) process.exit(130);
  line("\nCancelling the run. Press Ctrl-C again to quit at once.");
  cancelRun(run.runId);
});

// When the run could not be saved, run.finished never reaches SQLite.
const follower = new AbortController();
run.finished.catch(() => follower.abort());
for await (const event of followRun(run.runId, { signal: follower.signal })) {
  printStep(event);
}

try {
  await run.finished;
} catch (error) {
  console.error("The run could not be saved:", error);
}
const view = await loadRun(run.runId);
if (view) printSummary(view);
const exitCode = exitCodeOf(view?.status ?? null);
console.log(
  `Run ${run.runId}: ${view?.status ?? "not stored"}, exit code ${exitCode}`,
);
if (cli.args.json) {
  console.log(summaryLine(run.runId, view, performance.now() - startedAt));
}
process.exit(exitCode);
