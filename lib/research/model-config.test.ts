import { expect, it } from "vitest";
import { MODEL_CONFIG } from "./model-config";

it("runs every model step on Claude Sonnet 5.5 with an explicit effort", () => {
  for (const [step, config] of Object.entries(MODEL_CONFIG)) {
    expect(config.model, step).toBe("claude-sonnet-5-5");
    expect(["low", "medium", "high"], step).toContain(config.effort);
  }
  expect(Object.keys(MODEL_CONFIG).sort()).toEqual([
    "checkGaps",
    "extract",
    "pickFromMap",
    "plan",
    "select",
    "supports",
    "writeReport",
  ]);
});

it("limits the output of every model step", () => {
  for (const [step, config] of Object.entries(MODEL_CONFIG)) {
    expect(config.maxOutputTokens, step).toBeGreaterThanOrEqual(2_000);
    expect(config.maxOutputTokens, step).toBeLessThanOrEqual(16_000);
  }
  // A report of two pages is about 1,500 tokens of text, before any thinking.
  expect(MODEL_CONFIG.writeReport.maxOutputTokens).toBeGreaterThanOrEqual(
    8_000,
  );
});
