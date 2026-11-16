import { describe, expect, it } from "vitest";
import { type Check, overall, runChecks } from "./checks";
import type { StoredRun } from "./stored-run";
import { filler, REPORT, syntheticRun, URL_A, URL_B } from "./synthetic";

type Body = { type: string; [key: string]: unknown };

const byId = (checks: readonly Check[], id: string): Check => {
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`no check ${id}`);
  return check;
};

const statusOf = (run: StoredRun, id: string) =>
  byId(runChecks(run), id).status;

const extraReads = (round: number, urls: string[], succeed: boolean): Body[] =>
  urls.flatMap((url, i) => [
    {
      type: "decodo.requested",
      call: 100 + i,
      round,
      endpoint: "universal",
      input: url,
    },
    {
      type: "decodo.settled",
      call: 100 + i,
      outcome: succeed ? "ok" : "failed",
      detail: null,
      durationMs: 1,
    },
    succeed
      ? { type: "page.read", round, url, title: "x", chars: 1 }
      : {
          type: "page.failed",
          round,
          url,
          failure: { kind: "rejected", detail: "blocked" },
        },
  ]);

const insertBefore = (type: string, extra: Body[]) => (bodies: Body[]) => {
  const at = bodies.findIndex((b) => b.type === type);
  return [...bodies.slice(0, at), ...extra, ...bodies.slice(at)];
};

const pages = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => `https://example.net/${prefix}/${i}`);

describe("the check table", () => {
  it("passes a whole, well-formed run", () => {
    const checks = runChecks(syntheticRun());
    expect(
      checks.filter((c) => c.status !== "pass").map((c) => [c.id, c.evidence]),
    ).toEqual([]);
    expect(overall(checks)).toBe("pass");
  });

  it("gives every check an ID, a requirement, a measure and evidence", () => {
    for (const check of runChecks(syntheticRun())) {
      expect(check.id).toMatch(/^[a-z0-9]+\.[a-z0-9-]+$/);
      expect(check.requirement).not.toBe("");
      expect(check.measures).not.toBe("");
      expect(check.evidence.length).toBeGreaterThan(0);
    }
  });

  it("fails a ninth successful read in a round (B2)", () => {
    const run = syntheticRun({
      edit: insertBefore("page.extracted", extraReads(1, pages(7, "ok"), true)),
    });
    const check = byId(runChecks(run), "budget.reads");
    expect(check.status).toBe("fail");
    expect(check.evidence[0]).toBe("round 1: 9 pages read, limit 8");
  });

  it("allows failed reads up to 16 attempts, then fails (issue #8)", () => {
    const fourteen = syntheticRun({
      edit: insertBefore(
        "page.extracted",
        extraReads(1, pages(14, "bad"), false),
      ),
    });
    expect(statusOf(fourteen, "budget.reads")).toBe("pass");
    const fifteen = syntheticRun({
      edit: insertBefore(
        "page.extracted",
        extraReads(1, pages(15, "bad"), false),
      ),
    });
    expect(byId(runChecks(fifteen), "budget.reads").evidence[0]).toBe(
      "round 1: 17 read attempts, limit 16",
    );
  });

  it("fails a sixth search in a round, a fourth round, a second map and a page read twice", () => {
    const searches = Array.from({ length: 5 }, (_, i) => ({
      type: "decodo.requested",
      call: 200 + i,
      round: 1,
      endpoint: "google_search",
      input: `q${i}`,
    }));
    expect(
      statusOf(
        syntheticRun({ edit: insertBefore("select.finished", searches) }),
        "budget.searches",
      ),
    ).toBe("fail");

    const rounds = [2, 3, 4].map((round) => ({
      type: "round.started",
      round,
      queries: [],
    }));
    expect(
      statusOf(
        syntheticRun({ edit: insertBefore("report.delta", rounds) }),
        "budget.rounds",
      ),
    ).toBe("fail");

    const maps = [1, 2].map((i) => ({
      type: "decodo.requested",
      call: 300 + i,
      round: 1,
      endpoint: "map",
      input: `https://site${i}.org`,
    }));
    const mapped = syntheticRun({
      edit: insertBefore("reads.planned", [
        ...maps,
        ...maps.map((m) => ({
          type: "decodo.settled",
          call: m.call,
          outcome: "ok",
          detail: null,
          durationMs: 1,
        })),
      ]),
    });
    expect(statusOf(mapped, "budget.maps")).toBe("fail");

    const reread = syntheticRun({
      edit: insertBefore("page.extracted", [
        {
          type: "decodo.requested",
          call: 400,
          round: 1,
          endpoint: "universal",
          input: URL_A,
        },
        {
          type: "decodo.settled",
          call: 400,
          outcome: "ok",
          detail: null,
          durationMs: 1,
        },
      ]),
    });
    expect(byId(runChecks(reread), "budget.no-reread").evidence[0]).toBe(
      `read 2 times: ${URL_A}`,
    );
  });

  it("allows one rendered retry of an empty page (B7)", () => {
    const retried = syntheticRun({
      edit: insertBefore("reads.planned", [
        {
          type: "decodo.requested",
          call: 90,
          round: 1,
          endpoint: "universal",
          input: URL_A,
          rendered: true,
        },
        {
          type: "decodo.settled",
          call: 90,
          outcome: "ok",
          detail: null,
          durationMs: 1,
        },
      ]),
    });
    expect(byId(runChecks(retried), "budget.no-reread").status).toBe("pass");
  });

  it("fails a web action that is not search, read or map (W2, W3)", () => {
    const crawl = syntheticRun({
      edit: insertBefore("reads.planned", [
        {
          type: "decodo.requested",
          call: 500,
          round: 1,
          endpoint: "crawl",
          input: "https://x.org",
        },
        {
          type: "decodo.settled",
          call: 500,
          outcome: "ok",
          detail: null,
          durationMs: 1,
        },
      ]),
    });
    expect(statusOf(crawl, "web.actions")).toBe("fail");
  });

  it("requires a report for a completed run and none for a cancelled run (U5)", () => {
    expect(statusOf(syntheticRun({ report: null }), "report.presence")).toBe(
      "fail",
    );
    expect(
      statusOf(
        syntheticRun({ status: "CANCELLED", report: null }),
        "report.presence",
      ),
    ).toBe("pass");
    expect(
      statusOf(syntheticRun({ status: "CANCELLED" }), "report.presence"),
    ).toBe("fail");
    expect(
      statusOf(
        syntheticRun({ status: "FAILED", report: null }),
        "report.presence",
      ),
    ).toBe("skip");
  });

  it("fails a citation of a claim that was not verified (V4)", () => {
    const run = syntheticRun({
      report: REPORT.replace("used [^2].", "used [^2][^7]."),
    });
    const check = byId(runChecks(run), "report.citations");
    expect(check.status).toBe("fail");
    expect(check.evidence).toContain(
      "[^7] is not a verified claim of this run",
    );
  });

  it("fails a source without a verified claim and a cited page missing from the list (V4)", () => {
    const extra = REPORT.replace(
      "## Sources\n\n",
      "## Sources\n\n- [Other](https://other.org/x) · other.org · News · [^1]\n",
    );
    expect(statusOf(syntheticRun({ report: extra }), "report.sources")).toBe(
      "fail",
    );
    const missing = REPORT.replace(/^- \[Aging\].*\n/m, "");
    const check = byId(
      runChecks(syntheticRun({ report: missing })),
      "report.sources",
    );
    expect(check.evidence[0]).toBe(
      `[^2] cites ${URL_B}, which the source list lacks`,
    );
  });

  it("fails a source entry with an unknown label, a wrong domain or a non-http link (R7, S2)", () => {
    const label = REPORT.replace("· Blog ·", "· Magazine ·");
    expect(
      byId(runChecks(syntheticRun({ report: label })), "report.source-entries")
        .evidence[0],
    ).toContain('the label "Magazine" is not one of the eight');
    const domain = REPORT.replace("· example.org ·", "· example.net ·");
    expect(
      statusOf(syntheticRun({ report: domain }), "report.source-entries"),
    ).toBe("fail");
    const relabel = REPORT.replace("· Reference ·", "· News ·");
    expect(
      byId(
        runChecks(syntheticRun({ report: relabel })),
        "report.source-entries",
      ).evidence[0],
    ).toContain("listed as News, extracted as Reference");
  });

  it("fails an image, raw HTML and a link in the report body", () => {
    const hygiene = (report: string) =>
      byId(runChecks(syntheticRun({ report })), "report.hygiene");
    expect(
      hygiene(`![chart](https://x.org/a.png)\n\n${REPORT}`).evidence[0],
    ).toMatch(/^image: /);
    expect(
      hygiene(REPORT.replace("Padding", "<b>Padding</b>")).evidence[0],
    ).toBe("raw HTML: <b>");
    expect(
      hygiene(REPORT.replace("Padding", "[see](https://x.org)")).evidence[0],
    ).toMatch(/^link outside the source list: /);
    expect(
      hygiene(REPORT.replace("Padding", "https://x.org/page")).evidence[0],
    ).toMatch(/^URL outside the source list: /);
  });

  it("fails a report outside one to two pages (R2)", () => {
    const long = REPORT.replace("Padding", `Padding ${filler(900)}`);
    expect(statusOf(syntheticRun({ report: long }), "report.length")).toBe(
      "fail",
    );
    const short = REPORT.replace(/Padding .* \[\^1\]\./, "Short [^1].");
    expect(statusOf(syntheticRun({ report: short }), "report.length")).toBe(
      "fail",
    );
  });

  it("fails a report that opens with headings only (R1)", () => {
    const heading = `# Title\n\n## Answer\n\n${REPORT}`;
    expect(statusOf(syntheticRun({ report: heading }), "report.opening")).toBe(
      "fail",
    );
    expect(
      statusOf(
        syntheticRun({ report: `# Title\n\n${REPORT}` }),
        "report.opening",
      ),
    ).toBe("pass");
  });

  it("warns about uncited sentences and keeps marks after a full stop with their sentence (R3)", () => {
    const run = syntheticRun({
      report: REPORT.replace("used [^2].", "used. [^2] Rome fell in 476."),
    });
    const check = byId(runChecks(run), "report.uncited");
    expect(check.status).toBe("warn");
    expect(check.evidence.slice(1)).toEqual(["uncited: Rome fell in 476."]);
  });

  it("fails a dropped claim without a reason and a failed page without a reason (F1, F3)", () => {
    const noReason = syntheticRun({
      edit: (bodies) =>
        bodies.map((b) =>
          b.type === "claim.dropped" ? { ...b, reason: "" } : b,
        ),
    });
    expect(statusOf(noReason, "visible.claims")).toBe("fail");
    const failedPage = syntheticRun({
      edit: (bodies) =>
        bodies.map((b) =>
          b.type === "page.read" && b.url === URL_B
            ? {
                type: "page.failed",
                round: 1,
                url: URL_B,
                failure: { kind: "rejected", detail: "" },
              }
            : b,
        ),
    });
    expect(byId(runChecks(failedPage), "visible.pages").evidence[0]).toBe(
      `failed page without a reason: ${URL_B}`,
    );
  });

  it("fails a search without a result in the log (F2)", () => {
    const run = syntheticRun({
      edit: (bodies) => bodies.filter((b) => b.type !== "search.finished"),
    });
    expect(statusOf(run, "visible.searches")).toBe("fail");
  });

  it("fails a gap in the event log (F4)", () => {
    const run = syntheticRun();
    const events = run.events.filter((e) => e.seq !== 5);
    expect(statusOf({ ...run, events }, "log.integrity")).toBe("fail");
  });

  it("fails a verified quote that is not on its stored page, and names the closest text (V1)", () => {
    const run = syntheticRun({
      edit: (bodies) =>
        bodies.map((b) =>
          b.type === "claim.verified" && b.number === 1
            ? { ...b, quote: "LFP cells last about 4,000 cycles." }
            : b,
        ),
    });
    const check = byId(runChecks(run), "v1.stored");
    expect(check.status).toBe("fail");
    expect(check.evidence[0]).toContain("closest page text (6 of 7 words)");
  });

  it("fails a verified claim whose page text is missing (V1, U9)", () => {
    const run = syntheticRun({
      pages: { [URL_A]: "LFP cells last about 3,000 cycles." },
    });
    expect(byId(runChecks(run), "v1.stored").evidence[0]).toBe(
      `[^2] has no stored page text: ${URL_B}`,
    );
  });

  it("warns when the app dropped a quote for V1 that is on the page", () => {
    const run = syntheticRun({
      edit: (bodies) =>
        bodies.map((b) =>
          b.type === "claim.dropped"
            ? { ...b, failed: "V1", reason: "not-on-page" }
            : b,
        ),
    });
    expect(statusOf(run, "v1.drops")).toBe("warn");
  });

  it("turns a crash inside a check into a failed row", () => {
    const run = syntheticRun({
      edit: (bodies) =>
        bodies.map((b) =>
          b.type === "search.finished" ? { ...b, outcome: null } : b,
        ),
    });
    const check = byId(runChecks(run), "visible.searches");
    expect(check.status).toBe("fail");
    expect(check.evidence[0]).toMatch(/^the check crashed: /);
  });
});
