import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// `prisma generate` runs on postinstall, before a fresh clone has a `.env`.
if (existsSync(".env")) {
  process.loadEnvFile();
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
