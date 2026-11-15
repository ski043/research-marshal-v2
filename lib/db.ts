import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

const globalForDb = globalThis as typeof globalThis & {
  db?: PrismaClient;
};

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Dev hot reloads re-evaluate this module; reusing the client avoids opening a new connection each time.
globalForDb.db ??= createClient();

export const db = globalForDb.db;
