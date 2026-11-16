import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Check, contextOf, overall, runChecks } from "./audit/checks";
import { citedPages, liveCheck } from "./audit/live";
import { controlCheck, negativeControl } from "./audit/negative-control";
import { renderChecks, tally } from "./audit/render";
import {
  databasePath,
  loadStoredRun,
  openReadOnly,
  resolveRunId,
} from "./audit/stored-run";
import {
  type RunThresholds,
  renderTiming,
  timeRun,
  timingCheck,
} from "./audit/timing";

const USAGE = `Usage: pnpm verify:run <runId|latest> [options]

Judges one stored run against the PRD, straight from SQLite. Writes
.verify/<runId>/audit.json and exits 1 when a check fails.

Options:
  --self-test   Also alter one word in a few verified quotes and require that the
                independent V1 check rejects each (free).
  --timing      Also print where the time of the run went and compare it with
                verify/perf-thresholds.json (free; misses are warnings).
  --live        Also re-fetch every cited page through the Decodo CLI and check its
                quotes on the fresh text (paid: one request per cited page).
  --json        Print the result as JSON.
  --db <path>   Read this SQLite file instead of DATABASE_URL.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: "boolean", default: false },
    live: { type: "boolean", default: false },
    "self-test": { type: "boolean", default: false },
    timing: { type: "boolean", default: false },
    db: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help || positionals.length !== 1) {
  console.error(USAGE);
  process.exit(values.help ? 0 : 2);
}

const dbPath = databasePath(values.db, process.env);
const db = openReadOnly(dbPath);
const runId = resolveRunId(db, positionals[0] ?? "latest");
const stored = loadStoredRun(db, runId);
db.close();

const outDir = path.join(".verify", runId);
mkdirSync(outDir, { recursive: true });
const say = (text: string) => {
  if (!values.json) console.log(text);
};

const checks: Check[] = runChecks(stored);
const ctx = contextOf(stored);
const extra: Record<string, unknown> = {};

if (values["self-test"]) {
  const mutations = negativeControl(ctx);
  checks.push(controlCheck(mutations));
  extra.selfTest = mutations;
}

if (values.timing) {
  const thresholds = JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "../verify/perf-thresholds.json"),
      "utf8",
    ),
  ) as { run: RunThresholds };
  const timing = timeRun(stored);
  checks.push(timingCheck(timing, thresholds.run, stored.run.status));
  extra.timing = timing;
  say(`Timing of run ${runId}:\n${renderTiming(timing)}\n`);
}

if (values.live) {
  const pages = citedPages(ctx).size;
  console.error(
    `--live: re-fetching ${pages} cited pages through the Decodo CLI. This makes ${pages} paid requests.`,
  );
  const { check, sources } = await liveCheck(ctx, path.join(outDir, "live"));
  checks.push(check);
  extra.live = sources;
}

const verdict = overall(checks);
const result = {
  runId,
  question: stored.run.question,
  status: stored.run.status,
  database: dbPath,
  checkedAt: new Date().toISOString(),
  overall: verdict,
  checks,
  ...extra,
};
const outFile = path.join(outDir, "audit.json");
writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);

if (values.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Run ${runId} (${stored.run.status}): ${stored.run.question}`);
  console.log(`Database: ${dbPath}\n`);
  console.log(renderChecks(checks));
  console.log(
    `\n${verdict.toUpperCase()}: ${tally(checks)}. Written to ${outFile}.`,
  );
}
process.exit(verdict === "fail" ? 1 : 0);
