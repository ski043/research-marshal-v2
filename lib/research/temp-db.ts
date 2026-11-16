import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../prisma/migrations");

/** A fresh SQLite file with every migration applied, for tests that use the real store. */
export function createTempDatabase(): { url: string; remove: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "research-marshal-"));
  const file = path.join(dir, "test.db");
  const db = new DatabaseSync(file);
  for (const entry of readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()) {
    db.exec(
      readFileSync(path.join(MIGRATIONS, entry, "migration.sql"), "utf8"),
    );
  }
  db.close();
  return {
    url: `file:${file}`,
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
