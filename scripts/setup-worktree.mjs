// @ts-check
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// Checked before the dynamic imports below, which need a recent Node.js.
const wantedNode = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
).engines.node;
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < Number(/\d+/.exec(wantedNode)?.[0])) {
  console.error(
    `NOT READY: Node.js ${process.version} is too old, the project needs ${wantedNode}. Install Node.js 26 (the major in .nvmrc), then run \`pnpm bootstrap\` again.`,
  );
  process.exit(1);
}

const { CHECKS, failedLabels, formatHuman, realContext, runChecks } =
  await import("./doctor.mjs");
const {
  durableEnvPath,
  mergeEnvLocal,
  readEnvFile,
  resolveAppEnv,
  sqlitePath,
} = await import("./env-files.mjs");

/** @type {string[]} */
const problems = [];

/** @param {string} title */
function step(title) {
  console.log(`\n==> ${title}`);
}

/**
 * @param {string} title
 * @param {string[]} args
 */
function pnpm(title, args) {
  step(title);
  const result = spawnSync("pnpm", args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.log(`Failed: pnpm ${args.join(" ")}`);
    problems.push(`pnpm ${args.join(" ")} failed`);
  }
}

step("Check Node.js and pnpm");
const toolchain = await runChecks(
  realContext(root),
  CHECKS.filter((c) => c.id === "node" || c.id === "pnpm"),
);
for (const r of toolchain.results) {
  console.log(`${r.status.toUpperCase()}  ${r.label}: ${r.detail}`);
  if (r.fix) console.log(`      fix: ${r.fix}`);
}
problems.push(...failedLabels(toolchain.results));

step("Write .env.local");
const durablePath = durableEnvPath();
const durable = readEnvFile(durablePath);
const envLocal = path.join(root, ".env.local");
const before = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : null;
const merge = mergeEnvLocal(before, durable);
if (merge.text !== before) {
  writeFileSync(envLocal, merge.text, { mode: 0o600 });
}
chmodSync(envLocal, 0o600);
if (before === null) {
  console.log(`Created .env.local (mode 600) with ${merge.added.join(", ")}.`);
} else if (merge.added.length > 0) {
  console.log(
    `Added to .env.local: ${merge.added.join(", ")}. Kept every existing value.`,
  );
} else {
  console.log(".env.local already has every variable. Changed nothing.");
}
if (durable !== null && (statSync(durablePath).mode & 0o077) !== 0) {
  console.log(
    `Warning: others can read ${durablePath}. Run: chmod 600 ${durablePath}`,
  );
}
if (merge.missing.length > 0) {
  const dir = path.dirname(durablePath);
  console.log(
    durable === null
      ? `Missing: ${merge.missing.join(", ")}. The durable file ${durablePath} does not exist.`
      : `Missing: ${merge.missing.join(", ")}. The durable file ${durablePath} does not hold them.`,
  );
  console.log(
    "Create or edit the durable file once, then run `pnpm bootstrap` again:",
  );
  if (durable === null) {
    console.log(
      `  mkdir -p ${dir} && touch ${durablePath} && chmod 600 ${durablePath}`,
    );
  }
  console.log(`  Add one line per missing key to ${durablePath}:`);
  for (const name of merge.missing) console.log(`    ${name}=<value>`);
  problems.push(...merge.missing);
}
if (merge.empty.length > 0) {
  console.log(
    `Empty in .env.local: ${merge.empty.join(", ")}. Fill in each value or delete its line, then run \`pnpm bootstrap\` again.`,
  );
  problems.push(...merge.empty);
}

if (toolchain.ready) {
  pnpm("Install dependencies", ["install", "--frozen-lockfile"]);
  // pnpm install skips postinstall when node_modules is current, so a missing generated/ stays missing.
  pnpm("Generate the Prisma client", ["db:generate"]);
  pnpm("Apply the database migrations", ["db:migrate"]);
} else {
  step(
    "Skip install, Prisma client and migrations until Node.js and pnpm are fixed",
  );
}

const databaseUrl = resolveAppEnv(root, process.env).DATABASE_URL?.value;
const dbFile = databaseUrl ? sqlitePath(root, databaseUrl) : null;
if (dbFile && existsSync(dbFile)) chmodSync(dbFile, 0o600);

step("Check the worktree");
const report = await runChecks(realContext(root));
console.log(formatHuman(report).split("\n").slice(0, -1).join("\n"));

const missing = [...new Set([...problems, ...failedLabels(report.results)])];
console.log(
  missing.length === 0
    ? "\nREADY: this worktree is ready."
    : `\nNOT READY: ${missing.join(", ")}. See the fixes above.`,
);
process.exit(missing.length === 0 ? 0 : 1);
