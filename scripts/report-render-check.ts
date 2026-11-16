import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";

// Tags that Streamdown 2.7.1 produces for the constructs a report may hold.
const ALLOWED_TAGS = new Set([
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "em",
  "strong",
  "br",
  "a",
]);

const MODES = ["static", "streaming"] as const;

export function renderReport(
  markdown: string,
  mode: (typeof MODES)[number],
): string {
  return renderToStaticMarkup(
    createElement(
      Streamdown,
      { mode, linkSafety: { enabled: false } },
      markdown,
    ),
  );
}

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function sameUrl(href: string, url: string): boolean {
  if (href === url) return true;
  try {
    return decodeURI(href) === decodeURI(url);
  } catch {
    return false;
  }
}

export function textOf(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// Renders the Markdown the way the report page will and lists every way the
// HTML breaks the report contract: an image, a tag outside the allowlist, an
// attribute that loads or runs something, or a link that is not one of
// `links`, in that order.
export function problemsOf(
  markdown: string,
  links: readonly string[],
): string[] {
  const problems: string[] = [];
  for (const mode of MODES) {
    const html = renderReport(markdown, mode);
    const tags = [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g)];
    for (const [tag, name = "", attributes = ""] of tags) {
      const strong =
        name === "span" && /data-streamdown="strong"/.test(attributes);
      if (!ALLOWED_TAGS.has(name.toLowerCase()) && !strong) {
        problems.push(`${mode}: element ${tag}`);
      }
      if (/\s(?:src|srcset|style|on[a-z]+)=/i.test(attributes)) {
        problems.push(`${mode}: attribute in ${tag}`);
      }
    }
    if (/=\s*"?\s*javascript:/i.test(html)) {
      problems.push(`${mode}: javascript: URL`);
    }
    const hrefs = tags
      .filter(([, name]) => name?.toLowerCase() === "a")
      .map(([, , attributes = ""]) => {
        const href = /\shref="([^"]*)"/.exec(attributes)?.[1];
        return href === undefined ? null : decodeHtml(href);
      });
    const expected = [...links];
    const matches =
      hrefs.length === expected.length &&
      hrefs.every((href, i) => {
        const url = expected[i];
        return href !== null && url !== undefined && sameUrl(href, url);
      });
    if (!matches) {
      problems.push(
        `${mode}: links ${JSON.stringify(hrefs)}, expected ${JSON.stringify(expected)}`,
      );
    }
  }
  return problems;
}

// Lines only in `before` as "- ...", lines only in `after` as "+ ...".
function lineDiff(before: string[], after: string[]): string[] {
  const common = before.map(() => after.map(() => 0));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      const row = common[i] as number[];
      row[j] =
        before[i] === after[j]
          ? (common[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(common[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      i++;
      j++;
    } else if (
      j < after.length &&
      (i >= before.length ||
        (common[i]?.[j + 1] ?? 0) >= (common[i + 1]?.[j] ?? 0))
    ) {
      out.push(`+ ${after[j++]}`);
    } else {
      out.push(`- ${before[i++]}`);
    }
  }
  return out;
}

// Usage: node --import ./scripts/register.mjs scripts/report-render-check.ts <dev.db>
// Re-finalizes every stored model report from its raw draft and compares it
// with the stored report. The database is opened read-only.
async function checkStoredReports(path: string): Promise<boolean> {
  const { DatabaseSync } = await import("node:sqlite");
  const { RunEvent, RunEventBody, RunId, Question } = await import(
    "../lib/research/events"
  );
  const { createView, replay } = await import("../lib/research/run-view");
  const { finalizeReport, liveReport } = await import("../lib/research/report");

  const db = new DatabaseSync(path, { readOnly: true });
  const runs = db
    .prepare(
      `SELECT r.id, r.question FROM Run r JOIN RunEvent e ON e.runId = r.id
       WHERE json_extract(e.data, '$.type') = 'report.finished'
         AND json_extract(e.data, '$.writtenBy') = 'model'
       ORDER BY r.createdAt`,
    )
    .all() as { id: string; question: string }[];
  let ok = true;
  for (const run of runs) {
    const rows = db
      .prepare(
        "SELECT seq, at, data FROM RunEvent WHERE runId = ? ORDER BY seq",
      )
      .all(run.id) as { seq: number; at: number | string; data: string }[];
    const events = rows.map((row) =>
      RunEvent.parse({
        ...RunEventBody.parse(JSON.parse(row.data)),
        seq: row.seq,
        at: new Date(row.at).toISOString(),
      }),
    );
    const view = replay(
      createView(RunId.parse(run.id), Question.parse(run.question)),
      events,
    );
    const stored = events.find((e) => e.type === "report.finished");
    if (stored?.type !== "report.finished") continue;
    const chunks = events.flatMap((e) =>
      e.type === "report.delta" ? [e.text] : [],
    );

    const after = finalizeReport(chunks.join(""), view.verified);
    const urls = [
      ...new Set(
        after.cited.flatMap((n) => {
          const claim = view.verified.find((c) => c.number === n);
          return claim ? [claim.source.url] : [];
        }),
      ),
    ];
    const live = liveReport(view.verified);
    const deltas = [...chunks.map((c) => live.push(c)), live.end()].filter(
      (text) => text !== "",
    );
    const liveText = deltas.join("");
    const textBefore = textOf(renderReport(stored.markdown, "static"));
    const textAfter = textOf(renderReport(after.markdown, "static"));
    const changed = lineDiff(
      stored.markdown.split("\n"),
      after.markdown.split("\n"),
    );

    const problems = [
      ...problemsOf(after.markdown, urls),
      ...problemsOf(liveText, []),
      ...deltas.flatMap((text) => problemsOf(text, [])),
    ];
    const checks = {
      "render check": problems.length === 0,
      "same rendered text": textBefore === textAfter,
      "same citations":
        JSON.stringify(after.cited) === JSON.stringify(stored.cited),
      "live text = final body":
        liveText.trimEnd() === after.markdown.split("\n\n## Sources")[0],
    };
    ok &&= Object.values(checks).every(Boolean);
    console.log(`\n=== ${run.id}: ${run.question}`);
    console.log(
      `${after.cited.length} citations, ${urls.length} source links, ${chunks.length} stored chunks -> ${deltas.length} live segments`,
    );
    for (const [name, pass] of Object.entries(checks)) {
      console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
    }
    for (const problem of problems) console.log(`  ${problem}`);
    console.log(
      `Markdown: ${changed.filter((l) => l.startsWith("+")).length} lines changed against the stored report`,
    );
    for (const line of changed) console.log(`  ${line.slice(0, 160)}`);
  }
  db.close();
  return ok && runs.length > 0;
}

const script = process.argv[1];
if (script && import.meta.url === pathToFileURL(script).href) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: report-render-check.ts <path to dev.db>");
    process.exit(2);
  }
  process.exit((await checkStoredReports(path)) ? 0 : 1);
}
