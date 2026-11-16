import { describe, expect, it } from "vitest";
import { Question, RunId } from "@/lib/research/events";
import { createView, replay } from "@/lib/research/run-view";
import {
  EXIT,
  exitCodeOf,
  parseResearchArgs,
  summaryLine,
} from "./research-args";

describe("exitCodeOf", () => {
  it("gives each end of a run its own code", () => {
    expect(exitCodeOf("completed")).toBe(0);
    expect(exitCodeOf("failed")).toBe(1);
    expect(exitCodeOf("cancelled")).toBe(3);
    expect(new Set(Object.values(EXIT)).size).toBe(4);
  });

  it("counts a run that never finished or is not stored as failed", () => {
    expect(exitCodeOf("running")).toBe(EXIT.failed);
    expect(exitCodeOf(null)).toBe(EXIT.failed);
  });
});

describe("parseResearchArgs", () => {
  it("joins the words into the question", () => {
    expect(parseResearchArgs(["How", "long", "do", "LFP", "last?"])).toEqual({
      ok: true,
      args: { question: "How long do LFP last?", json: false, offline: null },
    });
  });

  it("reads --json anywhere", () => {
    const parsed = parseResearchArgs(["Why", "--json", "now?"]);
    expect(parsed).toMatchObject({
      ok: true,
      args: { question: "Why now?", json: true },
    });
  });

  it("keeps a word that starts with one dash in the question", () => {
    expect(parseResearchArgs(["Is", "-40", "C", "cold?"])).toMatchObject({
      ok: true,
      args: { question: "Is -40 C cold?" },
    });
  });

  it("takes everything after -- as the question", () => {
    expect(
      parseResearchArgs(["--", "--json", "is", "a", "flag"]),
    ).toMatchObject({
      ok: true,
      args: { question: "--json is a flag", json: false },
    });
  });

  it("reads an offline scenario and a pace", () => {
    expect(parseResearchArgs(["--offline", "budget", "--pace", "200"])).toEqual(
      {
        ok: true,
        args: {
          question: "",
          json: false,
          offline: { scenario: "budget", paceMs: 200 },
        },
      },
    );
  });

  it.each([
    [["--offline"], "--offline needs a scenario name."],
    [["--offline", "--json"], "--offline needs a scenario name."],
    [["--offline", "x", "--pace", "fast"], "--pace needs a whole number"],
    [["--offline", "x", "--pace", "-5"], "--pace needs a whole number"],
    [["--pace", "100", "q"], "--pace works only with --offline."],
    [["--verbose", "q"], "Unknown option --verbose."],
  ])("rejects %j", (argv, error) => {
    const parsed = parseResearchArgs(argv);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.error).toContain(error);
  });
});

describe("summaryLine", () => {
  it("adds the model totals to the JSON summary", () => {
    const runId = RunId.parse("run-1");
    const view = replay(createView(runId, Question.parse("Q?")), [
      {
        type: "model.called",
        step: "plan",
        outcome: "ok",
        queuedMs: 250,
        durationMs: 4_000,
        tokens: {
          input: 300,
          output: 200,
          reasoning: null,
          cacheRead: 0,
          cacheWrite: 0,
        },
        seq: 1,
        at: "2026-11-15T21:00:00.000Z",
      },
    ]);
    expect(JSON.parse(summaryLine(runId, view, 5_000)).model).toEqual({
      calls: 1,
      notOk: 0,
      durationMs: 4_000,
      queuedMs: 250,
      tokens: {
        input: 300,
        output: 200,
        reasoning: null,
        cacheRead: 0,
        cacheWrite: 0,
      },
    });
  });
});
