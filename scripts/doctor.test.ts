import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHECKS,
  type Context,
  formatHuman,
  runChecks,
} from "@/scripts/doctor.mjs";

const SCHEMA = 'datasource db {\n  provider = "sqlite"\n}\n';
const MIGRATION = "init";
const MIGRATION_SQL = 'CREATE TABLE "Run" ("id" TEXT);\n';
const LOCK = "lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n";

let root: string;

function write(file: string, text: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function writeDatabase(applied: { name: string; sql: string }[]) {
  const db = new DatabaseSync(path.join(root, "dev.db"));
  db.exec(
    "CREATE TABLE _prisma_migrations (migration_name TEXT, checksum TEXT, finished_at DATETIME, rolled_back_at DATETIME)",
  );
  for (const m of applied) {
    db.prepare("INSERT INTO _prisma_migrations VALUES (?, ?, 1, NULL)").run(
      m.name,
      createHash("sha256").update(m.sql).digest("hex"),
    );
  }
  db.close();
}

function readyWorktree() {
  write(
    "package.json",
    JSON.stringify({
      engines: { node: ">=26" },
      packageManager: "pnpm@12.18.0",
    }),
  );
  write("pnpm-lock.yaml", `---\nconfig: {}\n---\n${LOCK}`);
  write("node_modules/.pnpm/lock.yaml", LOCK);
  write("prisma/schema.prisma", SCHEMA);
  write(
    "generated/prisma/internal/class.ts",
    `const config = {\n  "inlineSchema": ${JSON.stringify(SCHEMA)},\n}\n`,
  );
  write(`prisma/migrations/${MIGRATION}/migration.sql`, MIGRATION_SQL);
  write(
    ".env.local",
    "ANTHROPIC_API_KEY=a\nDECODO_AUTH_TOKEN=d\nDATABASE_URL=file:./dev.db\n",
  );
  chmodSync(path.join(root, ".env.local"), 0o600);
  writeDatabase([{ name: MIGRATION, sql: MIGRATION_SQL }]);
}

function context(overrides: Partial<Context> = {}): Context {
  return {
    root,
    shellEnv: { RESEARCH_MARSHAL_ENV: path.join(root, "no-such-durable-file") },
    nodeVersion: "v26.10.0",
    pnpmVersion: () => "12.18.0",
    onPath: () => true,
    fetch: () => Promise.reject(new Error("no network in unit tests")),
    live: false,
    ...overrides,
  };
}

async function statusOf(id: string, ctx = context()) {
  const report = await runChecks(ctx);
  const result = report.results.find((r) => r.id === id);
  if (!result) throw new Error(`no result for ${id}`);
  return { report, result };
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "doctor-"));
  readyWorktree();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("runChecks", () => {
  it("passes every required check in a ready worktree", async () => {
    const report = await runChecks(context());

    expect(report.ready).toBe(true);
    expect(report.results.map((r) => [r.id, r.status])).toEqual(
      CHECKS.map((c) => [c.id, c.kind === "live" ? "skip" : "pass"]),
    );
  });

  it("fails an old Node.js with the install hint", async () => {
    const { report, result } = await statusOf(
      "node",
      context({ nodeVersion: "v24.1.0" }),
    );

    expect(report.ready).toBe(false);
    expect(result.status).toBe("fail");
    expect(result.fix).toContain("Node.js 26");
  });

  it("fails a pnpm that differs from packageManager", async () => {
    const { result } = await statusOf(
      "pnpm",
      context({ pnpmVersion: () => "11.0.0" }),
    );

    expect(result.status).toBe("fail");
    expect(result.detail).toBe("11.0.0, needs 12.18.0");
  });

  it("fails missing and out-of-sync dependencies", async () => {
    write("node_modules/.pnpm/lock.yaml", `${LOCK}  extra: {}\n`);
    expect((await statusOf("dependencies")).result).toMatchObject({
      status: "fail",
      fix: "pnpm install --frozen-lockfile",
    });

    rmSync(path.join(root, "node_modules"), { recursive: true });
    expect((await statusOf("dependencies")).result.detail).toBe(
      "node_modules is not installed",
    );
  });

  it("fails a Prisma client generated from another schema", async () => {
    write("prisma/schema.prisma", `${SCHEMA}// changed\n`);

    expect((await statusOf("prisma-client")).result).toMatchObject({
      status: "fail",
      fix: "pnpm db:generate",
    });
  });

  it("names the durable file when it lacks a missing key", async () => {
    write(".env.local", "DATABASE_URL=file:./dev.db\n");
    chmodSync(path.join(root, ".env.local"), 0o600);

    const { report, result } = await statusOf("env-anthropic-api-key");

    expect(result.status).toBe("fail");
    expect(result.fix).toContain(path.join(root, "no-such-durable-file"));
    expect(result.fix).toContain("pnpm bootstrap");
    expect(report.ready).toBe(false);
  });

  it("points at the bootstrap when only .env.local lacks a key", async () => {
    write(".env.local", "DATABASE_URL=file:./dev.db\n");
    write("durable", "ANTHROPIC_API_KEY=a\nDECODO_AUTH_TOKEN=d\n");
    const ctx = context({
      shellEnv: { RESEARCH_MARSHAL_ENV: path.join(root, "durable") },
    });

    expect((await statusOf("env-decodo-auth-token", ctx)).result.fix).toBe(
      "pnpm bootstrap",
    );
  });

  it("reads keys from the shell and .env as the app does", async () => {
    write(".env.local", "DATABASE_URL=file:./dev.db\n");
    chmodSync(path.join(root, ".env.local"), 0o600);
    write(".env", "DECODO_AUTH_TOKEN=d\n");
    chmodSync(path.join(root, ".env"), 0o600);
    const ctx = context({ shellEnv: { ANTHROPIC_API_KEY: "a" } });

    const report = await runChecks(ctx);

    expect(report.ready).toBe(true);
    expect(
      report.results.find((r) => r.id === "env-decodo-auth-token")?.detail,
    ).toBe("set in .env");
  });

  it("fails a .env.local that others can read", async () => {
    chmodSync(path.join(root, ".env.local"), 0o644);

    expect((await statusOf("env-file-modes")).result).toMatchObject({
      status: "fail",
      fix: "chmod 600 .env.local",
    });
  });

  it("passes a worktree that keeps every variable in .env", async () => {
    rmSync(path.join(root, ".env.local"));
    write(
      ".env",
      "ANTHROPIC_API_KEY=a\nDECODO_AUTH_TOKEN=d\nDATABASE_URL=file:./dev.db\n",
    );
    chmodSync(path.join(root, ".env"), 0o600);

    const report = await runChecks(context());

    expect(report.results.filter((r) => r.status === "fail")).toEqual([]);
    expect(report.ready).toBe(true);
  });

  it("fails a .env that others can read", async () => {
    write(".env", "DECODO_AUTH_TOKEN=d\n");
    chmodSync(path.join(root, ".env"), 0o644);

    expect((await statusOf("env-file-modes")).result).toMatchObject({
      status: "fail",
      fix: "chmod 600 .env",
    });
  });

  it("fails a missing database and a pending migration", async () => {
    write("prisma/migrations/second/migration.sql", "SELECT 1;\n");
    expect((await statusOf("database")).result).toMatchObject({
      status: "fail",
      detail: "dev.db: pending migrations: second",
      fix: "pnpm db:migrate",
    });

    rmSync(path.join(root, "dev.db"));
    expect((await statusOf("database")).result.detail).toBe(
      "dev.db does not exist",
    );
  });

  it("fails an applied migration whose file changed since", async () => {
    write(`prisma/migrations/${MIGRATION}/migration.sql`, "SELECT 2;\n");

    expect((await statusOf("database")).result.detail).toContain(
      "applied migrations differ",
    );
  });

  it("only warns when the Decodo CLI is missing", async () => {
    const { report, result } = await statusOf(
      "decodo-cli",
      context({ onPath: () => false }),
    );

    expect(result.status).toBe("warn");
    expect(report.ready).toBe(true);
  });

  it("runs the live checks only with live, and fails a rejected key", async () => {
    const calls: string[] = [];
    const ctx = context({
      live: true,
      fetch: async (input) => {
        calls.push(String(input));
        return new Response("{}", {
          status: String(input).includes("anthropic") ? 401 : 200,
        });
      },
    });

    const report = await runChecks(ctx);

    expect(calls).toEqual([
      "https://api.anthropic.com/v1/models?limit=1",
      "https://data.decodo.com/v1/scrape",
    ]);
    expect(
      report.results
        .filter((r) => r.kind === "live")
        .map((r) => [r.id, r.status]),
    ).toEqual([
      ["anthropic-key", "fail"],
      ["decodo-key", "pass"],
    ]);
    expect(report.ready).toBe(false);
  });

  it("turns a check that throws into a failure", async () => {
    rmSync(path.join(root, "package.json"));

    const { result } = await statusOf("node");

    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/^check failed:/);
  });
});

describe("formatHuman", () => {
  it("prints each check, the fix of each failure, and one final line", async () => {
    chmodSync(path.join(root, ".env.local"), 0o644);
    const report = await runChecks(context());

    const lines = formatHuman(report).split("\n");

    expect(lines).toHaveLength(1 + CHECKS.length + 1 + 1);
    expect(lines).toContainEqual(
      expect.stringMatching(/FAIL {2}Env file modes/),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/fix: chmod 600 \.env\.local$/),
    );
    expect(lines.at(-1)).toBe("NOT READY: Env file modes.");
  });

  it("ends with READY when nothing failed", async () => {
    expect(
      formatHuman(await runChecks(context()))
        .split("\n")
        .at(-1),
    ).toBe("READY: this worktree is ready.");
  });
});
