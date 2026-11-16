import { describe, expect, it } from "vitest";
import { parseReport } from "./report-md";

describe("parseReport", () => {
  it("reads a source link whose parentheses the app escaped", () => {
    const report = [
      "## Answer",
      "",
      "Alcohol raises stroke risk [^1].",
      "",
      "## Sources",
      "",
      "- [Lancet study](https://www.thelancet.com/journals/lancet/article/PIIS0140-6736\\(18\\)31772-0/fulltext) · thelancet.com · Paper · [^1]",
      "",
    ].join("\n");

    expect(parseReport(report).sources.map((s) => s.url)).toEqual([
      "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(18)31772-0/fulltext",
    ]);
  });
});
