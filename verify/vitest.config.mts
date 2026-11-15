import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["verify/**/*.verify.ts"],
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
