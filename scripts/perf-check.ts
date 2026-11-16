import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  CRITICAL_PATH_DELAYS,
  expectedPeaks,
  measureShape,
  type ShapeConfig,
} from "./perf/pipeline-shape";

const USAGE = `Usage: pnpm perf:check [--no-build] [--update-bundle-budget]

Free performance gates; no paid request. Times the unit tests, the type check and the
build (information only), compares the first-load JavaScript of each route with the
budget in verify/perf-thresholds.json, and checks that the pipeline reads and checks
pages in parallel. Exits 1 when a gate fails.

  --no-build              Use the existing .next build instead of running pnpm build.
  --update-bundle-budget  Write the current route sizes as the new budget.`;

const { values } = parseArgs({
  options: {
    "no-build": { type: "boolean", default: false },
    "update-bundle-budget": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, "..");
const thresholdsFile = path.join(root, "verify/perf-thresholds.json");
type Thresholds = {
  bundle: { marginPercent: number; routes: Record<string, number> };
  pipelineShape: ShapeConfig & { samples: number; wallDelaysMax: number };
};
const thresholds = JSON.parse(
  readFileSync(thresholdsFile, "utf8"),
) as Thresholds;

let failed = false;
const fail = (line: string) => {
  failed = true;
  console.log(`  FAIL  ${line}`);
};
const ok = (line: string) => console.log(`  PASS  ${line}`);
const info = (line: string) => console.log(`  INFO  ${line}`);
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

console.log(
  "Durations (information only; n=1 each, limited by machine load and warm caches):",
);
const timed = (label: string, args: string[]) => {
  const started = performance.now();
  const result = spawnSync("pnpm", ["-s", ...args], {
    cwd: root,
    encoding: "utf8",
  });
  const ms = performance.now() - started;
  if (result.status === 0) info(`${label.padEnd(10)} ${seconds(ms)}`);
  else {
    fail(`${label} exited ${result.status} after ${seconds(ms)}`);
    console.log(
      `${result.stdout}${result.stderr}`
        .trim()
        .split("\n")
        .slice(-15)
        .join("\n"),
    );
  }
  return result.status === 0;
};
timed("test", ["test"]);
timed("typecheck", ["typecheck"]);
const built = values["no-build"] || timed("build", ["build"]);

console.log("\nBundle size (first-load JavaScript, uncompressed):");
const statsFile = path.join(root, ".next/diagnostics/route-bundle-stats.json");
if (!built || !existsSync(statsFile)) {
  fail(`no ${path.relative(root, statsFile)}; run pnpm build first`);
} else {
  const stats = JSON.parse(readFileSync(statsFile, "utf8")) as {
    route: string;
    firstLoadUncompressedJsBytes: number;
  }[];
  const current = Object.fromEntries(
    stats.map((s) => [s.route, s.firstLoadUncompressedJsBytes]),
  );
  if (values["update-bundle-budget"]) {
    thresholds.bundle.routes = current;
    writeFileSync(thresholdsFile, `${JSON.stringify(thresholds, null, 2)}\n`);
    info(
      `wrote the budget of ${stats.length} routes to verify/perf-thresholds.json; commit it`,
    );
  } else {
    const { marginPercent, routes } = thresholds.bundle;
    for (const [route, bytes] of Object.entries(current)) {
      const budget = routes[route];
      if (budget === undefined) {
        fail(`${route} ${bytes.toLocaleString("en")} B has no budget`);
        continue;
      }
      const limit = Math.floor(budget * (1 + marginPercent / 100));
      const delta = `${bytes >= budget ? "+" : ""}${(((bytes - budget) / budget) * 100).toFixed(2)}%`;
      const line = `${route} ${bytes.toLocaleString("en")} B, budget ${budget.toLocaleString("en")} B (${delta}, limit +${marginPercent}%)`;
      if (bytes > limit) fail(line);
      else ok(line);
    }
    for (const route of Object.keys(routes)) {
      if (!(route in current))
        info(`${route} has a budget but is no longer built`);
    }
    if (failed) {
      console.log(
        "  To accept a new size on purpose: pnpm perf:check --update-bundle-budget, then commit verify/perf-thresholds.json.",
      );
    }
  }
}

const shape = thresholds.pipelineShape;
console.log(
  `\nPipeline shape (real pipeline on the test fakes, ${shape.delayMs} ms per web and model call, n=${shape.samples}):`,
);
const samples = [];
for (let i = 0; i < shape.samples; i += 1)
  samples.push(await measureShape(shape));
const walls = samples
  .map((s) => s.wallMs / shape.delayMs)
  .sort((a, b) => a - b);
const median = walls[Math.floor(walls.length / 2)] ?? Number.POSITIVE_INFINITY;
const spread = `min ${walls[0]?.toFixed(2)}, median ${median.toFixed(2)}, max ${walls.at(-1)?.toFixed(2)}`;
const wallLine = `wall ${spread} delays; parallel ideal ${CRITICAL_PATH_DELAYS}, limit ${shape.wallDelaysMax}`;
if (median <= shape.wallDelaysMax) ok(wallLine);
else fail(`${wallLine}: the reads or the checks no longer run side by side`);
for (const [name, want] of Object.entries(expectedPeaks(shape))) {
  const got = samples.map((s) => s.peaks[name] ?? 0);
  const line = `${name} calls in flight at once: ${[...new Set(got)].join(", ")}, expected ${want}`;
  if (got.every((n) => n === want)) ok(line);
  else fail(line);
}
info(
  "This measures the pipeline's own scheduling, not the network or the model.",
);

console.log(
  failed
    ? "\nFAIL: a performance gate failed."
    : "\nPASS: every performance gate passed.",
);
process.exit(failed ? 1 : 0);
