import { describe, expect, it } from "vitest";
import {
  ClaimNumber,
  PageUrl,
  type PlannedQuery,
  Question,
  RunId,
} from "./events";
import { finalizeReport, noClaimsReport } from "./report";
import { createView, type RunView, type VerifiedClaim } from "./run-view";

function claim(n: number, page: "a" | "b"): VerifiedClaim {
  return {
    number: ClaimNumber.parse(n),
    statement: `Statement ${n}`,
    quote: `Quote ${n}`,
    source: {
      url: PageUrl.parse(`https://www.${page}.org/page`),
      title: page === "a" ? "Page [A]" : "Page B",
      domain: `${page}.org`,
      label: page === "a" ? "Official" : "News",
    },
  };
}

const verified = [claim(1, "a"), claim(2, "b"), claim(3, "a")];

describe("finalizeReport", () => {
  it("removes a citation of an unknown number and reports it (V4)", () => {
    const result = finalizeReport(
      "A fact [^2]. A guess [^9]. Zero [^0].",
      verified,
    );
    expect(result.markdown).toContain("A fact [^2]. A guess. Zero.");
    expect(result.removedCitations).toEqual([9, 0]);
    expect(result.cited).toEqual([2]);
  });

  it("expands group forms to one citation each", () => {
    const result = finalizeReport("Both [^1, ^2] and [^3,1].", verified);
    expect(result.markdown).toContain("Both [^1][^2] and [^3][^1].");
    expect(result.cited).toEqual([1, 2, 3]);
  });

  it("cuts a source section that the model wrote and footnote definitions", () => {
    const result = finalizeReport(
      "Answer [^1].\n\n## References\n\n- [Fake](https://fake.example)\n\n[^1]: Fake note",
      verified,
    );
    expect(result.markdown).not.toContain("fake.example");
    expect(result.markdown).not.toContain("References");
    expect(result.markdown).not.toContain("Fake note");
  });

  it("reduces links and images in the body to their text (W1)", () => {
    const result = finalizeReport(
      "See [the page](https://evil.example/x) and ![chart](https://evil.example/c.png) [^1].",
      verified,
    );
    expect(result.markdown).toContain("See the page and chart [^1].");
    expect(result.markdown).not.toContain("evil.example");
  });

  it("appends the source list in the order of first citation, one entry per source (R7)", () => {
    const result = finalizeReport(
      "B first [^2]. Then A [^3] and [^1].",
      verified,
    );
    expect(result.markdown.split("## Sources\n\n")[1]).toBe(
      [
        "- [Page B](https://www.b.org/page) · b.org · News · [^2]",
        "- [Page \\[A\\]](https://www.a.org/page) · a.org · Official · [^3][^1]",
        "",
      ].join("\n"),
    );
  });

  it("lists only cited sources", () => {
    const result = finalizeReport("Only A [^1].", verified);
    expect(result.markdown).not.toContain("b.org");
  });

  it("is idempotent", () => {
    const once = finalizeReport(
      "Answer [^1, ^2]. [Link](https://x.example) [^7]\n\n### Sources\n- junk",
      verified,
    );
    const twice = finalizeReport(once.markdown, verified);
    expect(twice.markdown).toBe(once.markdown);
    expect(twice.cited).toEqual(once.cited);
  });
});

describe("noClaimsReport (R6)", () => {
  const query = (q: string): PlannedQuery => ({ subQuestion: q, query: q });

  function view(): RunView {
    return {
      ...createView(RunId.parse("r"), Question.parse("Why is the sky blue?")),
      error: { step: "extract", message: "provider refused" },
      rounds: [
        {
          no: 1,
          searches: [
            {
              query: query("sky blue"),
              outcome: { status: "ok", results: [] },
            },
            {
              query: query("rayleigh"),
              outcome: {
                status: "failed",
                failure: { kind: "timeout", detail: "150 s" },
              },
            },
          ],
          droppedQueries: [],
          unknownNumbers: [],
          map: null,
          gap: null,
        },
      ],
    };
  }

  it("says that no claim was verified, names the error, and lists every search", () => {
    const markdown = noClaimsReport(view());
    expect(markdown).toContain("Why is the sky blue?");
    expect(markdown).toContain("could not verify any claim");
    expect(markdown).toContain('"extract" failed: provider refused');
    expect(markdown).toContain('- Round 1: "sky blue", no results');
    expect(markdown).toContain(
      '- Round 1: "rayleigh", failed (timeout: 150 s)',
    );
    expect(markdown).not.toMatch(/\[\^\d+\]/);
  });
});
