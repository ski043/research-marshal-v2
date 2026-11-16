import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// loadEnvFile never overrides a set variable, so .env.local wins over .env and
// the shell wins over both, the same rule as `pnpm research` and Next.js.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
