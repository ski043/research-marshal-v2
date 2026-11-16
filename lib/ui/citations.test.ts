import { describe, expect, it } from "vitest";
import { citationOf, linkCitations } from "./citations";

const known = new Set([1, 2, 12]);

describe("linkCitations", () => {
  it("links a mark of a verified claim", () => {
    expect(linkCitations("LFP cells last long [^1].", known)).toBe(
      "LFP cells last long [1](#cite-1).",
    );
  });

  it("keeps adjacent marks adjacent", () => {
    expect(linkCitations("Heat shortens life [^1][^12].", known)).toBe(
      "Heat shortens life [1](#cite-1)[12](#cite-12).",
    );
  });

  it("leaves a mark with no verified claim as plain text", () => {
    expect(linkCitations("A guess [^7], a fact [^2].", known)).toBe(
      "A guess [^7], a fact [2](#cite-2).",
    );
  });

  it("leaves an escaped mark alone, as in a source title", () => {
    const line = "- [A page about \\[^1\\]](https://example.org/a) · [^1]";
    expect(linkCitations(line, known)).toBe(
      "- [A page about \\[^1\\]](https://example.org/a) · [1](#cite-1)",
    );
  });

  it("links a mark after an escaped backslash", () => {
    expect(linkCitations("a\\\\[^1]", known)).toBe("a\\\\[1](#cite-1)");
  });

  it("links the marks of the source list too", () => {
    const report =
      "# Answer\n\nIt lasts [^1].\n\n## Sources\n\n- [T](https://example.org/a) · example.org · Paper · [^1][^2]\n";
    expect(linkCitations(report, known)).toBe(
      "# Answer\n\nIt lasts [1](#cite-1).\n\n## Sources\n\n- [T](https://example.org/a) · example.org · Paper · [1](#cite-1)[2](#cite-2)\n",
    );
  });

  it("changes nothing when no claim is verified", () => {
    const report = "# No verified claims\n\nNothing [^1].\n";
    expect(linkCitations(report, new Set())).toBe(report);
  });
});

describe("citationOf", () => {
  it("reads the claim number of a citation link", () => {
    expect(citationOf("#cite-12")).toBe(12);
  });

  it("is null for every other link", () => {
    expect(citationOf("https://example.org/#cite-1")).toBeNull();
    expect(citationOf("#cite-")).toBeNull();
    expect(citationOf("#section")).toBeNull();
    expect(citationOf(undefined)).toBeNull();
  });
});
