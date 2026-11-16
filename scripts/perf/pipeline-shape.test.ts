import { describe, expect, it } from "vitest";
import { expectedPeaks, type Gate, measureShape } from "./pipeline-shape";

const CONFIG = { delayMs: 5, queries: 4, pages: 8, claimsPerPage: 3 };

function oneAtATime(only: string): Gate {
  let queue = Promise.resolve();
  return async (name) => {
    if (name !== only) return () => {};
    const previous = queue;
    let release = () => {};
    queue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  };
}

describe("the pipeline shape gate", () => {
  it("sees every search, read, extract and V2 check of a round in flight at once", async () => {
    const sample = await measureShape(CONFIG);
    for (const [name, peak] of Object.entries(expectedPeaks(CONFIG))) {
      expect(sample.peaks[name], name).toBe(peak);
    }
  });

  it("sees reads that run one at a time", async () => {
    const parallel = await measureShape(CONFIG);
    const sequential = await measureShape(CONFIG, oneAtATime("read"));
    expect(sequential.peaks.read).toBe(1);
    expect(sequential.wallMs).toBeGreaterThan(
      parallel.wallMs + 5 * CONFIG.delayMs,
    );
  });
});
