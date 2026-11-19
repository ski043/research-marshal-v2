import { describe, expect, it } from "vitest";
import { Question, type RunEvent, RunId } from "@/lib/research/events";
import { SCENARIOS } from "@/lib/research/offline";
import { runPipeline } from "@/lib/research/pipeline";
import { testRun } from "@/lib/research/testing";
import { addEvents, startLiveRun } from "./live-run";

const runId = RunId.parse("test-run");
const question = Question.parse("How long do LFP batteries last?");

async function completedRun() {
  const scenario = SCENARIOS.get("completed");
  const run = testRun({ model: scenario?.model, web: scenario?.web });
  await runPipeline(run.deps);
  return { events: run.events, view: run.view() };
}

describe("a live run", () => {
  it("reaches the stored view when the events arrive in batches", async () => {
    const { events, view } = await completedRun();
    let live = startLiveRun(runId, question, events.slice(0, 5));
    for (let i = 5; i < events.length; i += 3) {
      live = addEvents(live, events.slice(i, i + 3));
    }

    expect(live.view).toEqual(view);
    expect(live.events).toEqual(events);
  });

  it("drops an event that it already has, as after a resumed stream", async () => {
    const { events, view } = await completedRun();
    let live = startLiveRun(runId, question, events.slice(0, 10));
    live = addEvents(live, events.slice(4, 14));
    live = addEvents(live, events.slice(0, 14));
    live = addEvents(live, events.slice(12));

    expect(live.events.map((event) => event.seq)).toEqual(
      events.map((event) => event.seq),
    );
    expect(live.view).toEqual(view);
  });

  it("stops at a gap and goes on when the missing event arrives", async () => {
    const { events } = await completedRun();
    const first = startLiveRun(runId, question, events.slice(0, 3));
    const afterGap = addEvents(first, events.slice(4, 8));

    expect(afterGap).toBe(first);
    expect(addEvents(afterGap, events.slice(3, 8)).view.lastSeq).toBe(8);
  });

  it("ignores events after the run has finished", async () => {
    const { events } = await completedRun();
    const done = startLiveRun(runId, question, events);
    const last = events.at(-1) as RunEvent;
    const late = { ...last, seq: last.seq + 1 };

    expect(addEvents(done, [late])).toBe(done);
  });
});
