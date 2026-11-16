import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, expect, it, vi } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../prisma/migrations");
const names = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
const migrate = (db: DatabaseSync, name: string) =>
  db.exec(readFileSync(path.join(MIGRATIONS, name, "migration.sql"), "utf8"));

// A run stored by the first schema, before a run had a model.
const dir = mkdtempSync(path.join(tmpdir(), "research-marshal-"));
const file = path.join(dir, "old.db");
const sqlite = new DatabaseSync(file);
const [first, ...rest] = names;
if (!first) throw new Error("no migration");
migrate(sqlite, first);
sqlite.exec(
  `INSERT INTO "Run" ("id", "question", "status") VALUES ('old-run', 'An old question?', 'COMPLETED')`,
);
for (const name of rest) migrate(sqlite, name);
sqlite.close();

vi.stubEnv("DATABASE_URL", `file:${file}`);
const research = await import("./index");
const { db } = await import("@/lib/db");

afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("reads a run stored before the model column as a Sonnet run", async () => {
  const [summary] = await research.listRuns();
  expect(summary).toMatchObject({
    runId: "old-run",
    question: "An old question?",
    model: "sonnet",
    status: "completed",
  });
});
