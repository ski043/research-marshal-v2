// @ts-check
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_ENV_NAMES,
  DURABLE_ENV_NAMES,
  durableEnvPath,
  ENV_FILES,
  readEnvFile,
  resolveAppEnv,
  sqlitePath,
} from "./env-files.mjs";

/**
 * @typedef {{
 *   root: string,
 *   shellEnv: Record<string, string | undefined>,
 *   nodeVersion: string,
 *   pnpmVersion: () => string | null,
 *   onPath: (command: string) => boolean,
 *   fetch: typeof fetch,
 *   live: boolean,
 * }} Context
 * @typedef {{ ok: boolean, detail: string, fix?: string }} Outcome
 * @typedef {"required" | "optional" | "live"} Kind
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kind: Kind,
 *   fix: string,
 *   check: (ctx: Context) => Outcome | Promise<Outcome>,
 * }} Check
 * @typedef {"pass" | "fail" | "warn" | "skip"} Status
 * @typedef {{ id: string, label: string, kind: Kind, status: Status, detail: string, fix: string | null }} Result
 */

const BOOTSTRAP = "pnpm bootstrap";

/** @param {string} root */
function packageJson(root) {
  return JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
}

/** @param {string} text */
function lastYamlDocument(text) {
  const documents = text.split(/^---$/m);
  return (documents.at(-1) ?? "").trim();
}

/** @param {string} root */
function inlinePrismaSchema(root) {
  const file = path.join(root, "generated", "prisma", "internal", "class.ts");
  if (!existsSync(file)) return null;
  const prefix = '  "inlineSchema": ';
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(prefix));
  if (!line) return null;
  return JSON.parse(line.slice(prefix.length).replace(/,$/, ""));
}

/**
 * @param {string} root
 * @param {string} dbFile
 */
async function migrationState(root, dbFile) {
  const dir = path.join(root, "prisma", "migrations");
  const local = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      checksum: createHash("sha256")
        .update(readFileSync(path.join(dir, entry.name, "migration.sql")))
        .digest("hex"),
    }));
  // Imported here so that an old Node.js still reaches the version check.
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'",
      )
      .get();
    const rows = table
      ? /** @type {{ migration_name: string, checksum: string }[]} */ (
          db
            .prepare(
              "SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
            )
            .all()
        )
      : [];
    const applied = new Map(rows.map((r) => [r.migration_name, r.checksum]));
    return {
      pending: local.filter((m) => !applied.has(m.name)).map((m) => m.name),
      changed: local
        .filter(
          (m) => applied.has(m.name) && applied.get(m.name) !== m.checksum,
        )
        .map((m) => m.name),
    };
  } finally {
    db.close();
  }
}

/**
 * @param {Context} ctx
 * @param {string} name
 */
function envFix(ctx, name) {
  const held = resolveAppEnv(ctx.root, ctx.shellEnv)[name];
  if (held?.value === "") {
    return held.source === "the shell"
      ? `Unset ${name} in the shell, or give it a value there`
      : `Delete the empty ${name} line in ${held.source}, then run \`${BOOTSTRAP}\``;
  }
  if (!DURABLE_ENV_NAMES.includes(name)) return BOOTSTRAP;
  const durable = durableEnvPath(ctx.shellEnv);
  if (readEnvFile(durable)?.[name]) return BOOTSTRAP;
  return `Add the line ${name}=<value> to ${durable} (mode 600), then run \`${BOOTSTRAP}\``;
}

/**
 * @param {Context} ctx
 * @param {string} name
 * @returns {string | null}
 */
function appValue(ctx, name) {
  return resolveAppEnv(ctx.root, ctx.shellEnv)[name]?.value || null;
}

/** @param {unknown} error */
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {string} name */
const envCheck = (name) =>
  /** @type {Check} */ ({
    id: `env-${name.toLowerCase().replaceAll("_", "-")}`,
    label: name,
    kind: "required",
    fix: BOOTSTRAP,
    check(ctx) {
      const resolved = resolveAppEnv(ctx.root, ctx.shellEnv)[name];
      if (resolved?.value)
        return { ok: true, detail: `set in ${resolved.source}` };
      return {
        ok: false,
        detail: resolved
          ? `empty in ${resolved.source}`
          : "not set in the shell, .env.local or .env",
        fix: envFix(ctx, name),
      };
    },
  });

/** @type {Check[]} */
export const CHECKS = [
  {
    id: "node",
    label: "Node.js version",
    kind: "required",
    fix: "Install Node.js 26 (the major in .nvmrc), then run the command again",
    check(ctx) {
      const wanted = packageJson(ctx.root).engines.node;
      const major = Number(/\d+/.exec(wanted)?.[0]);
      const actual = Number(ctx.nodeVersion.replace(/^v/, "").split(".")[0]);
      return {
        ok: actual >= major,
        detail: `${ctx.nodeVersion}, needs ${wanted}`,
      };
    },
  },
  {
    id: "pnpm",
    label: "pnpm version",
    kind: "required",
    fix: "Run `corepack enable pnpm` so the packageManager pin selects pnpm, or install that version",
    check(ctx) {
      const wanted = String(packageJson(ctx.root).packageManager).replace(
        /^pnpm@/,
        "",
      );
      const actual = ctx.pnpmVersion();
      return {
        ok: actual === wanted,
        detail: `${actual ?? "pnpm not found"}, needs ${wanted}`,
      };
    },
  },
  {
    id: "dependencies",
    label: "Dependencies",
    kind: "required",
    fix: "pnpm install --frozen-lockfile",
    check(ctx) {
      const installed = path.join(
        ctx.root,
        "node_modules",
        ".pnpm",
        "lock.yaml",
      );
      if (!existsSync(installed))
        return { ok: false, detail: "node_modules is not installed" };
      const wanted = lastYamlDocument(
        readFileSync(path.join(ctx.root, "pnpm-lock.yaml"), "utf8"),
      );
      const ok = lastYamlDocument(readFileSync(installed, "utf8")) === wanted;
      return {
        ok,
        detail: ok
          ? "node_modules matches pnpm-lock.yaml"
          : "node_modules does not match pnpm-lock.yaml",
      };
    },
  },
  {
    id: "prisma-client",
    label: "Prisma client",
    kind: "required",
    fix: "pnpm db:generate",
    check(ctx) {
      const generated = inlinePrismaSchema(ctx.root);
      if (generated === null)
        return { ok: false, detail: "generated/prisma is missing" };
      const schema = readFileSync(
        path.join(ctx.root, "prisma", "schema.prisma"),
        "utf8",
      );
      const ok = generated === schema;
      return {
        ok,
        detail: ok
          ? "generated from the current prisma/schema.prisma"
          : "generated from an older prisma/schema.prisma",
      };
    },
  },
  ...APP_ENV_NAMES.map(envCheck),
  {
    id: "env-file-modes",
    label: "Env file modes",
    kind: "required",
    fix: "chmod 600 .env.local",
    check(ctx) {
      // A worktree can keep every variable in .env and have no .env.local.
      const open = ENV_FILES.filter((name) => {
        const file = path.join(ctx.root, name);
        return existsSync(file) && (statSync(file).mode & 0o077) !== 0;
      });
      return open.length === 0
        ? { ok: true, detail: "only the owner can read the env files" }
        : {
            ok: false,
            detail: `others can read ${open.join(" and ")}`,
            fix: `chmod 600 ${open.join(" ")}`,
          };
    },
  },
  {
    id: "database",
    label: "Database",
    kind: "required",
    fix: "pnpm db:migrate",
    async check(ctx) {
      const url = appValue(ctx, "DATABASE_URL");
      if (!url)
        return { ok: false, detail: "DATABASE_URL is not set", fix: BOOTSTRAP };
      const file = sqlitePath(ctx.root, url);
      if (!file)
        return {
          ok: false,
          detail: "DATABASE_URL is not a file: URL",
          fix: "Set DATABASE_URL=file:./dev.db in .env.local",
        };
      const shown = path.relative(ctx.root, file) || file;
      if (!existsSync(file))
        return { ok: false, detail: `${shown} does not exist` };
      const { pending, changed } = await migrationState(ctx.root, file);
      if (changed.length > 0)
        return {
          ok: false,
          detail: `${shown}: applied migrations differ from prisma/migrations: ${changed.join(", ")}`,
          fix: `Delete ${shown}, then run \`pnpm db:migrate\``,
        };
      if (pending.length > 0)
        return {
          ok: false,
          detail: `${shown}: pending migrations: ${pending.join(", ")}`,
        };
      return { ok: true, detail: `${shown}, every migration applied` };
    },
  },
  {
    id: "decodo-cli",
    label: "Decodo CLI",
    kind: "optional",
    fix: "npm install -g @decodo/cli",
    check(ctx) {
      const ok = ctx.onPath("decodo");
      return { ok, detail: ok ? "decodo is on PATH" : "decodo is not on PATH" };
    },
  },
  {
    id: "anthropic-key",
    label: "Anthropic key works",
    kind: "live",
    fix: "Replace ANTHROPIC_API_KEY in .env.local and in the durable file with a valid key",
    async check(ctx) {
      const key = appValue(ctx, "ANTHROPIC_API_KEY");
      if (!key)
        return {
          ok: false,
          detail: "ANTHROPIC_API_KEY is not set",
          fix: envFix(ctx, "ANTHROPIC_API_KEY"),
        };
      try {
        const res = await ctx.fetch(
          "https://api.anthropic.com/v1/models?limit=1",
          {
            headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (res.ok) return { ok: true, detail: "GET /v1/models answered 200" };
        if (res.status === 401 || res.status === 403)
          return {
            ok: false,
            detail: `Anthropic rejected the key (HTTP ${res.status})`,
          };
        return {
          ok: false,
          detail: `GET /v1/models answered HTTP ${res.status}`,
          fix: "Run the check again later",
        };
      } catch (error) {
        return {
          ok: false,
          detail: `request failed: ${describeError(error)}`,
          fix: "Check the network, then run the check again",
        };
      }
    },
  },
  {
    id: "decodo-key",
    label: "Decodo key works",
    kind: "live",
    fix: "Replace DECODO_AUTH_TOKEN in .env.local and in the durable file with a valid Web Data API key",
    async check(ctx) {
      const key = appValue(ctx, "DECODO_AUTH_TOKEN");
      if (!key)
        return {
          ok: false,
          detail: "DECODO_AUTH_TOKEN is not set",
          fix: envFix(ctx, "DECODO_AUTH_TOKEN"),
        };
      try {
        const res = await ctx.fetch("https://data.decodo.com/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            target: "universal",
            url: "https://example.com",
            proxy_pool: "standard",
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (res.ok)
          return {
            ok: true,
            detail: "one scrape of https://example.com answered 200",
          };
        if (res.status === 401 || res.status === 403)
          return {
            ok: false,
            detail: `Decodo rejected the key (HTTP ${res.status})`,
          };
        return {
          ok: false,
          detail: `the scrape answered HTTP ${res.status}`,
          fix: "Run the check again later",
        };
      } catch (error) {
        return {
          ok: false,
          detail: `request failed: ${describeError(error)}`,
          fix: "Check the network, then run the check again",
        };
      }
    },
  },
];

/**
 * @param {Context} ctx
 * @param {Check[]} [checks]
 * @returns {Promise<{ ready: boolean, results: Result[] }>}
 */
export async function runChecks(ctx, checks = CHECKS) {
  /** @type {Result[]} */
  const results = [];
  for (const c of checks) {
    const base = { id: c.id, label: c.label, kind: c.kind };
    if (c.kind === "live" && !ctx.live) {
      results.push({
        ...base,
        status: "skip",
        detail: "run with --live to check",
        fix: null,
      });
      continue;
    }
    /** @type {Outcome} */
    let outcome;
    try {
      outcome = await c.check(ctx);
    } catch (error) {
      outcome = { ok: false, detail: `check failed: ${describeError(error)}` };
    }
    /** @type {Status} */
    const status = outcome.ok
      ? "pass"
      : c.kind === "optional"
        ? "warn"
        : "fail";
    results.push({
      ...base,
      status,
      detail: outcome.detail,
      fix: outcome.ok ? null : (outcome.fix ?? c.fix),
    });
  }
  return { ready: results.every((r) => r.status !== "fail"), results };
}

/** @param {Result[]} results */
export function failedLabels(results) {
  return results.filter((r) => r.status === "fail").map((r) => r.label);
}

/**
 * @param {{ ready: boolean, results: Result[] }} report
 * @returns {string}
 */
export function formatHuman({ ready, results }) {
  const width = Math.max(...results.map((r) => r.label.length));
  const lines = ["Research Marshal worktree doctor"];
  for (const r of results) {
    lines.push(
      `  ${r.status.toUpperCase().padEnd(4)}  ${r.label.padEnd(width)}  ${r.detail}`,
    );
    if (r.fix) lines.push(`        ${"".padEnd(width)}  fix: ${r.fix}`);
  }
  lines.push(
    ready
      ? "READY: this worktree is ready."
      : `NOT READY: ${failedLabels(results).join(", ")}.`,
  );
  return lines.join("\n");
}

/**
 * @param {string} root
 * @param {{ live?: boolean }} [options]
 * @returns {Context}
 */
export function realContext(root, { live = false } = {}) {
  return {
    root,
    shellEnv: process.env,
    nodeVersion: process.version,
    pnpmVersion() {
      const out = spawnSync("pnpm", ["--version"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
      });
      return out.status === 0 ? out.stdout.trim() : null;
    },
    onPath(command) {
      return spawnSync("sh", ["-c", `command -v ${command}`]).status === 0;
    },
    fetch: globalThis.fetch,
    live,
  };
}

const HELP = `Usage: pnpm doctor:worktree [--json] [--live]

Checks whether this worktree is ready: Node.js and pnpm versions, dependencies,
Prisma client, the three environment variables, the env file modes, and the
database migrations. It changes no file. Exit code 0 means ready.

  --json   Print the result as JSON.
  --live   Also check that both keys work. This makes one free Anthropic
           request (GET /v1/models) and one PAID Decodo request (a scrape of
           https://example.com).

pnpm installs missing dependencies before it runs any script. For a check
that changes nothing at all, run: node scripts/doctor.mjs`;

/** @param {string} metaUrl */
export function isMain(metaUrl) {
  const entry = process.argv[1];
  return entry !== undefined && realpathSync(entry) === fileURLToPath(metaUrl);
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const unknown = args.filter(
    (a) => !["--json", "--live", "--help", "-h"].includes(a),
  );
  if (args.includes("--help") || args.includes("-h") || unknown.length > 0) {
    if (unknown.length > 0)
      console.error(`Unknown option: ${unknown.join(" ")}\n`);
    console.log(HELP);
    process.exit(unknown.length > 0 ? 2 : 0);
  }
  const root = path.resolve(import.meta.dirname, "..");
  const report = await runChecks(
    realContext(root, { live: args.includes("--live") }),
  );
  console.log(
    args.includes("--json")
      ? JSON.stringify({ ready: report.ready, checks: report.results }, null, 2)
      : formatHuman(report),
  );
  process.exit(report.ready ? 0 : 1);
}
