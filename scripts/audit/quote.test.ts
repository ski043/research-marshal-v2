import { describe, expect, it } from "vitest";
import { PageWords, wordsOf } from "./quote";

const found = (page: string, quote: string) =>
  new PageWords(page).find(quote).found;

describe("the independent V1 check", () => {
  it("ignores whitespace, emphasis, headings, bullets and tables", () => {
    const page =
      "## Life\n\n- LFP cells   last\nabout **3,000** _cycles_.\n\n| a | b |";
    expect(found(page, "Life LFP cells last about 3,000 cycles")).toBe(true);
    expect(found(page, "LFP cells last about 3,000 cycles.")).toBe(true);
  });

  it("reads link text, drops link targets and images, and decodes entities", () => {
    const page =
      'See [the cycle guide](https://x.org/a_(b) "Guide") ![chart](c.png)for &quot;LFP&quot; &amp; NMC.';
    expect(found(page, 'See the cycle guide for "LFP" & NMC.')).toBe(true);
    expect(found(page, "chart")).toBe(false);
    expect(found(page, "x org")).toBe(false);
  });

  it("drops footnote marks, also when they are links to a fragment", () => {
    expect(found("risk.[43](#R43)Drinking more", "risk. Drinking more")).toBe(
      true,
    );
    expect(found("Rome.[\\[48\\]](#cite_note-48) Then", "Rome. Then")).toBe(
      true,
    );
    expect(
      found(
        'effects[14](/a#ref-CR14 "Davis (2010).") (systematic error)',
        "effects (systematic error)",
      ),
    ).toBe(true);
    expect(found("Rome fell[1] in 476.", "Rome fell in 476.")).toBe(true);
  });

  it("keeps a number that links to another page, because it may be a real word", () => {
    expect(
      found("In [2020](https://x.org/2020) prices fell", "In prices fell"),
    ).toBe(false);
  });

  it("fails a changed, an added or a missing word", () => {
    const page = "LFP cells last about 3,000 cycles in normal use.";
    expect(found(page, "LFP cells last about 4,000 cycles")).toBe(false);
    expect(found(page, "LFP cells do not last about 3,000 cycles")).toBe(false);
    expect(found(page, "LFP cells last 3,000 cycles")).toBe(false);
    expect(found(page, "LFP cells last about 3,000 cycles in use")).toBe(false);
  });

  it("fails a change of case, and a quote that only matches across a gap", () => {
    expect(found("LFP cells last long.", "lfp cells last long.")).toBe(false);
    expect(
      found(
        "cells last. Long text here. about 3,000",
        "cells last about 3,000",
      ),
    ).toBe(false);
  });

  it("does not match inside a word", () => {
    expect(found("The batteries lasted", "batter")).toBe(false);
    expect(found("The batteries lasted", "batteries last")).toBe(false);
  });

  it("rejects an empty quote and explains a miss with the closest page text", () => {
    expect(new PageWords("text").find(" ** ")).toEqual({
      found: false,
      reason: "empty-quote",
    });
    const verdict = new PageWords("Heat shortens the life of a cell.").find(
      "Heat extends the life",
    );
    expect(verdict).toMatchObject({
      found: false,
      closest: { matched: 3, of: 4, pageText: "Heat shortens the life" },
    });
  });

  it("splits on punctuation and keeps letters with marks together", () => {
    expect(wordsOf("Café-au-lait, 10² mg")).toEqual([
      "Café",
      "au",
      "lait",
      "10²",
      "mg",
    ]);
  });
});
