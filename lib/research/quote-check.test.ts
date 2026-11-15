import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonical, QuotablePage, type QuoteCheck } from "./quote-check";

const wikipedia = readFileSync(
  new URL("./fixtures/wikipedia-excerpt.md", import.meta.url),
  "utf8",
);

const NOT_ON_PAGE: QuoteCheck = { found: false, reason: "not-on-page" };
const FOUND: QuoteCheck = { found: true };

type Row = [name: string, page: string, quote: string, expected: QuoteCheck];

const rows: Row[] = [
  [
    "whitespace differs",
    "The Great Barrier Reef\n   is the world's   largest coral reef system.",
    "The Great Barrier Reef is the world's largest coral reef system.",
    FOUND,
  ],
  [
    "bold and emphasis on the page",
    "It covers **344,400 square kilometres** of the _Coral Sea_.",
    "It covers 344,400 square kilometres of the Coral Sea.",
    FOUND,
  ],
  [
    "links with titles and a target with parentheses",
    'It lies off [Queensland](https://en.wikipedia.org/wiki/Queensland "Queensland"), [Australia](/wiki/Australia_(continent)).',
    "It lies off Queensland, Australia.",
    FOUND,
  ],
  [
    "escaped and plain reference marks",
    "The reef is visible from space.[\\[3\\]](#cite_note-3) It was listed in 1981.[4]",
    "The reef is visible from space. It was listed in 1981.",
    FOUND,
  ],
  [
    "typographic quotes and an en dash",
    "The report calls it “the planet’s largest living structure” – a claim that",
    'The report calls it "the planet\'s largest living structure" - a claim',
    FOUND,
  ],
  [
    "the page wraps the quote in quotation marks",
    'Scientists said: "Bleaching affected 91% of reefs."',
    "Bleaching affected 91% of reefs",
    FOUND,
  ],
  [
    "the quote carries quotation marks and ellipses at its edges",
    "They said that bleaching affected 91% of reefs in 2022.",
    '"…bleaching affected 91% of reefs…"',
    FOUND,
  ],
  [
    "heading and bullets",
    "## Key facts\n\n- Length: 2,300 km\n- Age: about 20,000 years",
    "Length: 2,300 km Age: about 20,000 years",
    FOUND,
  ],
  [
    "table cells",
    "| Country | Population |\n| --- | --- |\n| Germany | 83.2 million |",
    "Germany 83.2 million",
    FOUND,
  ],
  [
    "the quote kept the bold marks",
    "It covers **344,400 square kilometres** of the Coral Sea.",
    "It covers **344,400 square kilometres**",
    FOUND,
  ],
  [
    "an em dash separates words",
    "The sky is blue—and the grass is green.",
    "The sky is blue",
    FOUND,
  ],
  [
    "changed word",
    "is the world's largest coral reef system",
    "is the world's biggest coral reef system",
    NOT_ON_PAGE,
  ],
  [
    "missing word",
    "The reef is not visible from space.",
    "The reef is visible from space.",
    NOT_ON_PAGE,
  ],
  [
    "added word",
    "It was listed in 1981.",
    "It was first listed in 1981.",
    NOT_ON_PAGE,
  ],
  [
    "changed number",
    "It covers 344,400 square kilometres",
    "It covers 344,000 square kilometres",
    NOT_ON_PAGE,
  ],
  ["part of a number", "The road covers 1,500 km.", "500 km", NOT_ON_PAGE],
  ["dropped sign", "The temperature fell to -5 °C.", "5 °C", NOT_ON_PAGE],
  ["part of a decimal", "Growth was 0.5 percent.", "5 percent", NOT_ON_PAGE],
  ["dropped currency symbol", "It cost $5 million.", "5 million", NOT_ON_PAGE],
  [
    "part of a word",
    "Wildcats are protected.",
    "cats are protected",
    NOT_ON_PAGE,
  ],
  ["case differs", "the WHO said", "the who said", NOT_ON_PAGE],
  [
    "stitched passages",
    "A is true. B is false. C is unknown.",
    "A is true. C is unknown.",
    NOT_ON_PAGE,
  ],
  [
    "joined words",
    "stored in a data base",
    "stored in a database",
    NOT_ON_PAGE,
  ],
  [
    "list numbers are words",
    "1. Norway\n2. Denmark",
    "1. Denmark",
    NOT_ON_PAGE,
  ],
  [
    "a link target is not page text",
    "See the [report](https://example.org/annual-report-2024).",
    "annual-report-2024",
    NOT_ON_PAGE,
  ],
  [
    "a quote of punctuation only",
    "anything",
    '"..."',
    { found: false, reason: "empty-quote" },
  ],
  [
    "Wikipedia: a sentence copied as plain text",
    wikipedia,
    "Because of their low cost, high safety, low toxicity, long cycle life and other factors, LFP batteries are finding a number of roles in vehicle use, utility-scale stationary applications, and backup power.",
    FOUND,
  ],
  [
    "Wikipedia: a sentence that ends before a link with a title",
    wikipedia,
    "As of September 2022, LFP type battery market share for EVs reached 31%, and of that, 68% were from EV makers Tesla and BYD alone.",
    FOUND,
  ],
  [
    "Wikipedia: the same sentence with one word changed",
    wikipedia,
    "Because of their low cost, high safety, low toxicity, short cycle life and other factors, LFP batteries are finding a number of roles in vehicle use, utility-scale stationary applications, and backup power.",
    NOT_ON_PAGE,
  ],
  [
    "Wikipedia: the same sentence with one number changed",
    wikipedia,
    "As of September 2022, LFP type battery market share for EVs reached 37%, and of that, 68% were from EV makers Tesla and BYD alone.",
    NOT_ON_PAGE,
  ],
  [
    "Wikipedia: a citation-needed mark between two sentences",
    'Cells last longer when cool.\\[_[citation needed](https://en.wikipedia.org/wiki/Wikipedia:Citation_needed "Wikipedia:Citation needed")_\\] Heat ages them.',
    "Cells last longer when cool. Heat ages them.",
    FOUND,
  ],
  [
    "a lowercase note mark and a numbered note mark",
    "It was built in 1932.[a] It opened in 1933 [note 3] to traffic.",
    "It was built in 1932. It opened in 1933 to traffic.",
    FOUND,
  ],
  [
    "an edit link after a heading",
    "## History [[edit](https://en.wikipedia.org/w/index.php?action=edit&section=1)]\n\nThe first cell was made in 1996.",
    "History The first cell was made in 1996.",
    FOUND,
  ],
  [
    "[sic] holds a word and stays",
    "The sign read: they was [sic] here.",
    "they was here.",
    NOT_ON_PAGE,
  ],
];

describe("QuotablePage.contains (V1)", () => {
  it.each(rows)("%s", (_name, page, quote, expected) => {
    expect(new QuotablePage(page).contains(quote)).toEqual(expected);
  });
});

describe("canonical", () => {
  it.each(rows)("is idempotent: %s", (_name, page, quote) => {
    expect(canonical(canonical(page))).toBe(canonical(page));
    expect(canonical(canonical(quote))).toBe(canonical(quote));
  });
});
