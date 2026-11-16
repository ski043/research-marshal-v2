import { describe, expect, it } from "vitest";
import { contextOf } from "./checks";
import { controlCheck, mutate, negativeControl } from "./negative-control";
import { syntheticRun } from "./synthetic";

describe("the negative control", () => {
  it("changes, drops or adds the middle word", () => {
    const quote = "Heat shortens their life a lot.";
    expect(mutate(quote, "changed", "the")).toBe(
      "Heat shortens their the a lot.",
    );
    expect(mutate(quote, "dropped", "the")).toBe("Heat shortens their a lot.");
    expect(mutate(quote, "added", "the")).toBe(
      "Heat shortens their life not a lot.",
    );
    expect(mutate("They last 3,000 full cycles.", "changed", "the")).toBe(
      "They last 4,000 full cycles.",
    );
  });

  it("rejects every altered quote of a run", () => {
    const mutations = negativeControl(contextOf(syntheticRun()));
    expect(mutations.length).toBe(6);
    expect(mutations.every((m) => m.rejected)).toBe(true);
    expect(controlCheck(mutations).status).toBe("pass");
  });

  it("fails when the check would accept an altered quote", () => {
    const check = controlCheck([
      {
        number: 1,
        url: "u",
        kind: "dropped",
        original: "a b c",
        mutated: "a c",
        rejected: false,
      },
    ]);
    expect(check.status).toBe("fail");
    expect(check.evidence[1]).toBe('accepted (dropped) [^1]: "a c"');
  });
});
