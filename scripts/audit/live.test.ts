import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { contextOf } from "./checks";
import { type Fetched, failureOf, liveCheck } from "./live";
import { PAGE_A, PAGE_B, syntheticRun, URL_A, URL_B } from "./synthetic";

const dir = () => mkdtempSync(path.join(tmpdir(), "live-"));
const ok = (markdown: string): Fetched => ({
  ok: true,
  markdown,
  statusCode: 200,
  ms: 5,
});

async function liveWith(pages: Record<string, Fetched>, run = syntheticRun()) {
  return liveCheck(
    contextOf(run),
    dir(),
    async (url) => pages[url] ?? { ok: false, error: "no page", ms: 1 },
  );
}

describe("the live re-fetch", () => {
  it("passes when every fresh page holds its quotes, and says whether the text changed", async () => {
    const { check, sources } = await liveWith({
      [URL_A]: ok(PAGE_A),
      [URL_B]: ok(`${PAGE_B}\n\nFooter 2026`),
    });
    expect(sources.map((s) => s.outcome)).toEqual([
      "same-text",
      "quotes-found",
    ]);
    expect(check.status).toBe("pass");
  });

  it("reports a changed page and a failed re-fetch as their own outcomes, not as failed quotes", async () => {
    const { check, sources } = await liveWith({
      [URL_A]: ok("The page now says something else."),
      [URL_B]: { ok: false, error: "HTTP 403", ms: 3 },
    });
    expect(sources.map((s) => s.outcome)).toEqual([
      "page-changed",
      "refetch-failed",
    ]);
    expect(check.status).toBe("warn");
  });

  it("fails a quote that is missing from a fresh page identical to the stored one", async () => {
    const run = syntheticRun({
      edit: (bodies) =>
        bodies.map((b) =>
          b.type === "claim.verified" && b.number === 1
            ? { ...b, quote: "Cells never age." }
            : b,
        ),
    });
    const { check, sources } = await liveWith(
      { [URL_A]: ok(PAGE_A), [URL_B]: ok(PAGE_B) },
      run,
    );
    expect(sources[0]?.outcome).toBe("quote-missing");
    expect(check.status).toBe("fail");
  });

  it("takes the reason of a failed CLI call from its stderr", async () => {
    const error = await promisify(execFile)(process.execPath, [
      "-e",
      "console.error('warning: x\\nError: Request failed with status 403'); process.exit(1)",
    ]).catch((e: unknown) => e);
    expect(failureOf(error)).toBe("Error: Request failed with status 403");
  });
});
