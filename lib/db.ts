import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { readEnv } from "@/lib/env";

const globalForDb = globalThis as typeof globalThis & {
  db?: PrismaClient;
};

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: readEnv(["DATABASE_URL"]).DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

/**
 * The one database client of the process. It is created on first use: `next build`
 * evaluates this module without a database. Dev hot reloads re-evaluate the module, and
 * reusing the client avoids opening a new connection each time.
 */
export function getDb(): PrismaClient {
  globalForDb.db ??= createClient();
  return globalForDb.db;
}
