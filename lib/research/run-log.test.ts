import { describe, expect, it } from "vitest";
import { Question, type RunEvent, RunId } from "./events";
import { createRunLog } from "./run-log";

function setup(persist?: (event: RunEvent) => Promise<void>) {
  const stored: RunEvent[] = [];
  const log = createRunLog({
    runId: RunId.parse("run-1"),
    question: Question.parse("Q?"),
    persist:
      persist ??
      (async (event) => {
        stored.push(event);
      }),
    now: () => new Date("2026-11-15T21:00:00.000Z"),
  });
  return { log, stored };
}

describe("createRunLog", () => {
  it("numbers events from 1 and applies each to the view at once", () => {
    const { log } = setup();
    log.emit({ type: "run.error", step: "plan", message: "boom" });
    expect(log.view.lastSeq).toBe(1);
    expect(log.view.error).toEqual({ step: "plan", message: "boom" });
  });

  it("persists in seq order even when an earlier write is slower", async () => {
    const order: number[] = [];
    const { log } = setup(async (event) => {
      await new Promise((r) => setTimeout(r, event.seq === 1 ? 20 : 0));
      order.push(event.seq);
    });
    log.emit({ type: "report.delta", text: "a" });
    log.emit({ type: "report.delta", text: "b" });
    log.emit({ type: "report.delta", text: "c" });
    await log.settled();
    expect(order).toEqual([1, 2, 3]);
  });

  it("the first seal wins, and nothing is written after it", async () => {
    const { log, stored } = setup();
    log.emit({ type: "report.delta", text: "a" });
    log.seal({ status: "cancelled" });
    log.emit({ type: "report.delta", text: "late" });
    log.seal({ status: "completed", stoppedBy: "budget" });
    await log.settled();

    expect(stored.map((e) => e.type)).toEqual(["report.delta", "run.finished"]);
    expect(stored.at(-1)).toMatchObject({ end: { status: "cancelled" } });
    expect(log.view.status).toBe("cancelled");
  });

  it("settled rejects when a write failed", async () => {
    const { log } = setup(async (event) => {
      if (event.seq === 2) throw new Error("disk full");
    });
    log.emit({ type: "report.delta", text: "a" });
    log.emit({ type: "report.delta", text: "b" });
    log.emit({ type: "report.delta", text: "c" });
    await expect(log.settled()).rejects.toThrow("disk full");
  });
});
