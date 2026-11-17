import { describe, expect, it } from "vitest";
import { Question, type RunEvent, RunId } from "@/lib/research/events";
import { SCENARIOS } from "@/lib/research/offline";
import { runPipeline } from "@/lib/research/pipeline";
import { createView, replay } from "@/lib/research/run-view";
import { testRun } from "@/lib/research/testing";
import { totalsOf } from "./totals";

async function totalsOfScenario(
  name: string,
  until: (event: RunEvent) => boolean = () => false,
) {
  const scenario = SCENARIOS.get(name);
  if (!scenario) throw new Error(`no scenario ${name}`);
  const run = testRun({ model: scenario.model, web: scenario.web });
  await runPipeline(run.deps);
  const stop = run.events.findIndex(until);
  const events = stop === -1 ? run.events : run.events.slice(0, stop + 1);
  return totalsOf(
    replay(createView(RunId.parse("test-run"), Question.parse("Q?")), events),
  );
}

describe("totalsOf", () => {
  it("counts every failed and every skipped page of the run (F1)", async () => {
    expect(await totalsOfScenario("failures")).toEqual({
      searches: 3,
      pagesRead: 1,
      pagesFailed: 1,
      pagesSkipped: 1,
      claimsVerified: 1,
      claimsDropped: 0,
    });
  });

  it("counts the dropped claims beside the verified ones (F3)", async () => {
    expect(await totalsOfScenario("dropped")).toMatchObject({
      claimsVerified: 1,
      claimsDropped: 2,
    });
  });

  it("adds the rounds up, where the budget meters show one round", async () => {
    expect(await totalsOfScenario("budget")).toMatchObject({
      searches: 11,
      pagesRead: 24,
    });
  });

  it("counts a running run so far", async () => {
    expect(
      await totalsOfScenario("budget", (event) => event.type === "page.read"),
    ).toMatchObject({ searches: 5, pagesRead: 1, claimsVerified: 0 });
  });
});
