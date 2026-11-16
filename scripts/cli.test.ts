import { spawn } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import type { RunRecord } from "@/lib/research";
import { createTempDatabase } from "@/lib/research/temp-db";
import type { ResearchSummary } from "./research-args";

const temp = createTempDatabase();
afterAll(() => temp.remove());

type Result = { code: number | null; stdout: string; stderr: string };

function run(
  script: "research" | "runs",
  args: readonly string[],
  onStdout?: (text: string, kill: () => void) => void,
): Promise<Result> {
  const child = spawn(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--import",
      "./scripts/register.mjs",
      `scripts/${script}.ts`,
      ...args,
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: temp.url,
        ANTHROPIC_API_KEY: "",
        DECODO_AUTH_TOKEN: "",
      },
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    onStdout?.(stdout, () => child.kill("SIGINT"));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  return new Promise((resolve) => {
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function lastJson<T>(stdout: string): T {
  return JSON.parse(stdout.trimEnd().split("\n").at(-1) ?? "") as T;
}

describe("pnpm research", () => {
  it("exits 0 for a completed offline run and ends with a JSON summary", async () => {
    const result = await run("research", ["--offline", "completed", "--json"]);
    expect(result.code).toBe(0);
    const summary = lastJson<ResearchSummary>(result.stdout);
    expect(summary).toMatchObject({
      status: "completed",
      stoppedBy: "answered",
      exitCode: 0,
      rounds: 1,
    });
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[0]).toMatch(new RegExp(`^Run ${summary.runId}: `));
    expect(lines.at(-2)).toBe(`Run ${summary.runId}: completed, exit code 0`);
  });

  it("exits 3 when Ctrl-C cancels the run", async () => {
    let sent = false;
    const result = await run(
      "research",
      ["--offline", "completed", "--pace", "300", "--json"],
      (stdout, kill) => {
        if (!sent && stdout.includes("Round 1")) {
          sent = true;
          kill();
        }
      },
    );
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("Run finished: cancelled");
    expect(lastJson<ResearchSummary>(result.stdout)).toMatchObject({
      status: "cancelled",
      exitCode: 3,
      reportChars: null,
    });
  });

  it.each([
    [[]],
    [["--offline", "no-such-scenario"]],
    [["--pace", "10", "a question"]],
  ])("exits 2 for the usage error %j", async (args) => {
    const result = await run("research", args);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage: pnpm research");
    expect(result.stdout).toBe("");
  });

  it("lists the scenarios when the name is unknown", async () => {
    const { stderr } = await run("research", ["--offline", "nope"]);
    for (const name of [
      "completed",
      "failures",
      "dropped",
      "budget",
      "no-claims",
    ]) {
      expect(stderr).toContain(`  ${name} `);
    }
  });
});

describe("pnpm runs", () => {
  it("round-trips the report through show --json and show --report", async () => {
    const research = await run("research", ["--offline", "dropped", "--json"]);
    const { runId } = lastJson<ResearchSummary>(research.stdout);

    const json = await run("runs", ["show", runId, "--json"]);
    expect(json.code).toBe(0);
    const record = JSON.parse(json.stdout) as RunRecord;
    expect(record.summary.runId).toBe(runId);
    expect(record.events.at(-1)?.type).toBe("run.finished");
    expect(record.view.dropped).toHaveLength(2);

    const report = await run("runs", ["show", runId, "--report"]);
    expect(report.code).toBe(0);
    expect(record.view.report?.kind).toBe("final");
    expect(report.stdout).toBe(
      record.view.report?.kind === "final" ? record.view.report.markdown : null,
    );

    const latest = await run("runs", ["show", "latest"]);
    expect(latest.stdout.split("\n")[0]).toBe(`Run ${runId}`);
    const list = await run("runs", ["list"]);
    expect(list.stdout.split("\n")[1]).toMatch(new RegExp(`^${runId} `));
  });

  it.each([
    [["show", "no-such-run"], 1],
    [["list", "extra"], 2],
    [["show"], 2],
    [["show", "latest", "--json", "--report"], 2],
    [["show", "latest", "--verbose"], 2],
    [["drop", "latest"], 2],
  ])("exits for %j with code %i", async (args, code) => {
    const result = await run("runs", args);
    expect(result.code).toBe(code);
    expect(result.stdout).toBe("");
  });
});
