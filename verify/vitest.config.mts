import { defineConfig } from "vitest/config";

// Every check in this folder makes paid requests. The flag keeps a plain
// `vitest --config verify/vitest.config.mts` from running them by accident.
if (process.env.RESEARCH_MARSHAL_PAID !== "1") {
  throw new Error(
    "The checks under verify/ make paid requests. Run `pnpm verify:stack`.",
  );
}

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
