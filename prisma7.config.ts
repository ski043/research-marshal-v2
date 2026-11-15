import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// `prisma generate` runs on postinstall, before a fresh clone has an env file.
const envFile = [".env.local", ".env"].find((file) => existsSync(file));
if (envFile) {
  process.loadEnvFile(envFile);
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
