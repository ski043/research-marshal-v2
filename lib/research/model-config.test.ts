import { expect, it } from "vitest";
import { ModelChoice } from "./events";
import { MODEL_OPTIONS, MODEL_STEPS, MODELS, stepConfig } from "./model-config";

const LIMITS = {
  plan: 4_000,
  select: 2_000,
  pickFromMap: 2_000,
  extract: 8_000,
  supports: 2_000,
  checkGaps: 4_000,
  writeReport: 12_000,
  classifySentences: 4_000,
  repairSentences: 4_000,
};

it("names every model step", () => {
  expect([...MODEL_STEPS].sort()).toEqual([
    "checkGaps",
    "classifySentences",
    "extract",
    "pickFromMap",
    "plan",
    "repairSentences",
    "select",
    "supports",
    "writeReport",
  ]);
});

it.each(ModelChoice.options)(
  "runs every step of %s on its own model with an explicit effort and the output limits",
  (choice) => {
    for (const step of MODEL_STEPS) {
      const config = stepConfig(choice, step);
      expect(config.model, step).toBe(MODELS[choice].id);
      expect(["low", "medium", "high"], step).toContain(config.effort);
      expect(config.maxOutputTokens, step).toBe(LIMITS[step]);
    }
  },
);

it("gives each choice its own model ID", () => {
  expect(
    Object.fromEntries(ModelChoice.options.map((c) => [c, MODELS[c].id])),
  ).toEqual({
    fable: "claude-fable-5-2",
    opus: "claude-opus-5-5",
    sonnet: "claude-sonnet-5-5",
    haiku: "claude-haiku-5-5",
  });
});

it("keeps the effort of a step the same on every model", () => {
  for (const step of MODEL_STEPS) {
    const efforts = new Set(
      ModelChoice.options.map((c) => stepConfig(c, step).effort),
    );
    expect(efforts.size, step).toBe(1);
  }
});

it("lists the switcher choices in order, without a model ID", () => {
  expect(MODEL_OPTIONS.map((o) => o.key)).toEqual([
    "fable",
    "opus",
    "sonnet",
    "haiku",
  ]);
  for (const option of MODEL_OPTIONS) {
    expect(Object.keys(option).sort()).toEqual(["hint", "key", "name"]);
    expect(option.name).toBe(MODELS[option.key].name);
  }
});
