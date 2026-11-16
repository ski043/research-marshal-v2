import { describe, expect, it } from "vitest";
import {
  problemsOf,
  renderReport,
  textOf,
} from "../../scripts/report-render-check";
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

function hostile(title: string, url: string): VerifiedClaim {
  return {
    number: ClaimNumber.parse(1),
    statement: "Statement",
    quote: "Quote",
    source: { url: url as PageUrl, title, domain: "a.com", label: "Blog" },
  };
}

const sourceList = (markdown: string) =>
  markdown.split("\n\n## Sources\n\n")[1] ?? "";

describe("finalizeReport source list (R7, #5)", () => {
  const cases: [string, string, string][] = [
    [
      "a ) that ends the link",
      "T",
      "https://a.com/a)![x](https://evil.example/u.png)",
    ],
    ["an unbalanced (", "T", "https://a.com/a(b"],
    ["brackets, quotes and marks", "T", "https://a.com/x_(y)[z]'q|w%5Ee*f~g"],
    ["whitespace and a ) in a raw URL", "T", "https://a.com/a b\n)c\t<d>"],
    [
      "a backslash before the )",
      "T",
      "https://a.com/a\\)![x](https://evil.example/b.png)",
    ],
    [
      "a blank line and a heading in the title",
      "Real\n\n![x](https://evil.example/t.png)\n\n# Fake heading",
      "https://a.com/p",
    ],
    [
      "raw HTML in the title",
      '<img src="https://evil.example/h.png"> <b>bold</b>',
      "https://a.com/p",
    ],
    [
      "Markdown in the title",
      "[x](https://evil.example/l) **b** `c` <https://evil.example/a> www.evil.example a@evil.example ~d~ | e",
      "https://a.com/p",
    ],
    [
      "entities in the title",
      "&lt;img src=x&gt; &#91;y&#93;&#40;https://evil.example&#41; &amp;",
      "https://a.com/p",
    ],
    ["a citation mark in the title", "Fake [^1] and [^2]", "https://a.com/p"],
    [
      "a title of control characters only",
      "\u0000\u0007\n\t\u001b‮⁦",
      "https://a.com/p",
    ],
  ];

  it.each(cases)(
    "renders exactly one link to the page for %s",
    (_, title, url) => {
      const result = finalizeReport("Fact [^1].", [hostile(title, url)]);
      expect(problemsOf(result.markdown, [url])).toEqual([]);
      expect(sourceList(result.markdown).split("\n")).toHaveLength(2);
    },
  );

  it("keeps the title as one line of plain text", () => {
    const title = "Real\n\n# Fake heading\r\n<b>bold</b> & [x]";
    const result = finalizeReport("Fact [^1].", [
      hostile(title, "https://a.com/p"),
    ]);
    const html = renderReport(sourceList(result.markdown), "static");
    expect(textOf(html)).toBe(
      "Real # Fake heading <b>bold</b> & [x] · a.com · Blog · [^1]",
    );
  });

  it("names the domain when no text is left of the title", () => {
    const result = finalizeReport("Fact [^1].", [
      hostile("\u0000\u0007\n\t‮", "https://a.com/p"),
    ]);
    expect(textOf(renderReport(sourceList(result.markdown), "static"))).toBe(
      "a.com · a.com · Blog · [^1]",
    );
  });

  it("shortens an unusually long title", () => {
    const result = finalizeReport("Fact [^1].", [
      hostile(`${"Long title ".repeat(1000)}<img src=x>`, "https://a.com/p"),
    ]);
    const entry = sourceList(result.markdown);
    expect(entry.length).toBeLessThan(400);
    expect(entry).not.toContain("img");
    expect(problemsOf(result.markdown, ["https://a.com/p"])).toEqual([]);
  });
});

describe("finalizeReport draft cleanup (#6)", () => {
  const drafts: [string, string][] = [
    [
      "a reference image",
      "Fact [^1].\n\n![x][r]\n\n[r]: https://evil.example/r.png",
    ],
    [
      "a collapsed reference image",
      "Fact ![r][] [^1].\n\n[r]: https://evil.example/r.png",
    ],
    [
      "a reference link",
      "Fact [^1]. [click][r]\n\n[r]: https://evil.example/phish",
    ],
    [
      "a shortcut reference link",
      'Fact [r] [^1].\n\n[r]: <https://evil.example/s> "t"',
    ],
    [
      "raw HTML",
      'Fact [^1].\n\n<img src="https://evil.example/d.png"> <b>b</b> <a href="https://evil.example">a</a>',
    ],
    [
      "an HTML block",
      '<div>\n<img src="https://evil.example/d.png">\n</div>\n\nFact [^1].',
    ],
    [
      "HTML that hides text",
      "<!-- [x](https://evil.example/c) -->\n\n<details open><summary>s</summary>t</details>\n\nFact [^1].",
    ],
    [
      "script and style",
      '<script>alert(1)</script><style>p{}</style><iframe src="https://evil.example"></iframe>\n\nFact [^1].',
    ],
    [
      "an autolink",
      "Fact [^1]. <https://evil.example/click> <mailto:a@evil.example>",
    ],
    [
      "bare URLs and an email",
      "Fact [^1]. https://bare.example/y www.bare.example a@bare.example",
    ],
    [
      "a link with nested brackets and parens",
      "Fact [^1]. [a [b] c](https://x.example/a_(b)) [d](<https://e.example/x)y>)",
    ],
    [
      "an image inside a link",
      "Fact [^1]. [![alt](https://evil.example/i.png)](https://evil.example/l)",
    ],
    [
      "a link split over two lines",
      "Fact [^1]. [one\ntwo](https://evil.example/2)",
    ],
    [
      "entities that spell a link",
      'Fact [^1]. &#91;x&#93;&#40;https://evil.example&#41; &lt;img src="https://evil.example/e.png"&gt;',
    ],
    [
      "a citation used as a link",
      "Fact [^1](https://evil.example/c) and ![^1](https://evil.example/i.png).",
    ],
    [
      "a citation next to a link",
      "Fact [^1][r].\n\n[r]: https://evil.example/r",
    ],
    [
      "an unknown citation before a tag",
      'Fact [^1] <[^9]img src="https://evil.example/u.png">.',
    ],
    [
      "code",
      'Fact [^1]. `<img src=x>`\n\n```html\n<img src="https://evil.example/f.png">\n```\n\n    <img src="https://evil.example/i.png">',
    ],
    [
      "a table and a quote",
      "| a | b |\n| --- | --- |\n| [x](https://evil.example) | y [^1] |\n\n> quoted [^1]",
    ],
    [
      "a footnote definition with a link",
      "Fact [^1].\n\n[^1]: [x](https://evil.example/f)\n    ![y](https://evil.example/g.png)",
    ],
  ];

  it.each(drafts)("renders no image, HTML or link from %s", (_, draft) => {
    const result = finalizeReport(draft, verified);
    expect(problemsOf(result.markdown, ["https://www.a.org/page"])).toEqual([]);
    const body = result.markdown.split("\n\n## Sources")[0];
    expect(body).not.toMatch(/(?<!\\)(?:\]\(|!\[|<[a-z])/i);
  });

  it.each(drafts)("is idempotent on %s", (_, draft) => {
    const once = finalizeReport(draft, verified);
    expect(finalizeReport(once.markdown, verified).markdown).toBe(
      once.markdown,
    );
  });

  it("keeps headings, paragraphs, lists, emphasis and citations", () => {
    const draft =
      "# Answer\n\nLFP lasts **long** and *well* [^1][^3].\n\n## Detail\n\n- First [^2]\n- Second\n\n1. One\n2. Two";
    const result = finalizeReport(draft, verified);
    expect(result.markdown.split("\n\n## Sources")[0]).toBe(draft);
    expect(result.cited).toEqual([1, 3, 2]);
  });

  it("keeps the text of a link, an image and inline code", () => {
    const result = finalizeReport(
      "See [the page](https://evil.example/x), ![a chart](https://evil.example/c.png) and `code` [^1].",
      verified,
    );
    expect(result.markdown).toContain("See the page, a chart and code [^1].");
  });

  it("shows a raw tag and a bare URL as text, not as markup", () => {
    const result = finalizeReport(
      "Fact [^1]. &lt;img src=x&gt; costs 5 < 6 and see https://bare.example/y",
      verified,
    );
    const html = renderReport(
      result.markdown.split("\n\n## Sources")[0] ?? "",
      "static",
    );
    expect(textOf(html).replaceAll("\u2060", "")).toBe(
      "Fact [^1]. <img src=x> costs 5 < 6 and see https://bare.example/y",
    );
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

  it("writes searches, the question and the error as plain text", () => {
    const base = view();
    const hostileView: RunView = {
      ...base,
      question: Question.parse("Why <img src=x> [^1]?"),
      error: { step: "extract", message: "![x](https://evil.example/e.png)" },
      rounds: base.rounds.map((round) => ({
        ...round,
        searches: [
          {
            query: query("![q](https://evil.example/q.png)\n\n# Heading"),
            outcome: { status: "ok", results: [] },
          },
        ],
      })),
    };
    const markdown = noClaimsReport(hostileView);
    expect(problemsOf(markdown, [])).toEqual([]);
    expect(markdown).not.toMatch(/\[\^\d+\]/);
    expect(textOf(renderReport(markdown, "static"))).toContain(
      '"![q](https\u2060://evil.example/q.png) # Heading", no results',
    );
  });
});
