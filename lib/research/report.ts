import type { ClaimNumber, Question, StoppedBy } from "./events";
import type { RunView, VerifiedClaim } from "./run-view";

const CITATION = /\[\^(\d+)\]/g;
const CITATION_GROUP = /\[\^(\d+(?:\s*,\s*\^?\d+)+)\]/g;
const SOURCE_HEADING =
  /^#{1,6}[ \t]+(?:sources|references|bibliography|citations)[ \t]*:?[ \t]*$/gim;
const FOOTNOTE_DEFINITION = /^[ \t]*\[\^\d+\]:.*$\n?/gm;
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK = /\[([^\]^][^\]]*)\]\([^)]*\)/g;

export type ReportBrief = {
  question: Question;
  stoppedBy: StoppedBy;
  missing: readonly string[];
  claims: readonly VerifiedClaim[];
};

export type FinalReport = {
  markdown: string;
  cited: readonly ClaimNumber[];
  removedCitations: readonly number[];
};

function cutSourceSection(draft: string): string {
  const headings = [...draft.matchAll(SOURCE_HEADING)];
  const last = headings.at(-1);
  return last?.index === undefined ? draft : draft.slice(0, last.index);
}

function escapeLinkText(text: string): string {
  return text.replace(/[[\]\\]/g, "\\$&");
}

export function finalizeReport(
  draft: string,
  verified: readonly VerifiedClaim[],
): FinalReport {
  const byNumber = new Map<number, VerifiedClaim>(
    verified.map((claim) => [claim.number, claim]),
  );
  const removed: number[] = [];

  const body = cutSourceSection(draft)
    .replace(FOOTNOTE_DEFINITION, "")
    .replace(CITATION_GROUP, (_, group: string) =>
      group
        .split(",")
        .map((part) => `[^${part.trim().replace(/^\^/, "")}]`)
        .join(""),
    )
    .replace(/[ \t]*\[\^(\d+)\]/g, (mark: string, digits: string) => {
      const number = Number(digits);
      if (byNumber.has(number)) return mark;
      if (!removed.includes(number)) removed.push(number);
      return "";
    })
    .replace(IMAGE, "$1")
    .replace(LINK, "$1")
    .trimEnd();

  const cited: ClaimNumber[] = [];
  for (const match of body.matchAll(CITATION)) {
    const claim = byNumber.get(Number(match[1]));
    if (claim && !cited.includes(claim.number)) cited.push(claim.number);
  }

  const sources = new Map<
    string,
    { claim: VerifiedClaim; numbers: number[] }
  >();
  for (const number of cited) {
    const claim = byNumber.get(number);
    if (!claim) continue;
    const entry = sources.get(claim.source.url);
    if (entry) entry.numbers.push(number);
    else sources.set(claim.source.url, { claim, numbers: [number] });
  }
  const list = [...sources.values()].map(({ claim, numbers }) => {
    const { title, url, domain, label } = claim.source;
    const marks = numbers.map((n) => `[^${n}]`).join("");
    return `- [${escapeLinkText(title)}](${url}) · ${domain} · ${label} · ${marks}`;
  });

  const markdown =
    list.length === 0
      ? `${body}\n`
      : `${body}\n\n## Sources\n\n${list.join("\n")}\n`;
  return { markdown, cited, removedCitations: removed };
}

function describeSearch(
  outcome: RunView["rounds"][number]["searches"][number]["outcome"],
): string {
  if (outcome === null) return "did not finish";
  if (outcome.status === "failed") {
    return `failed (${outcome.failure.kind}: ${outcome.failure.detail})`;
  }
  const n = outcome.results.length;
  return n === 0 ? "no results" : `${n} ${n === 1 ? "result" : "results"}`;
}

export function noClaimsReport(view: RunView): string {
  const lines = [
    "# No verified claims",
    "",
    `Research Marshal could not verify any claim for the question "${view.question}". This report therefore states no facts.`,
  ];
  if (view.error) {
    lines.push(
      "",
      `The run stopped early because the step "${view.error.step}" failed: ${view.error.message}`,
    );
  }
  lines.push("", "## Searches of the run", "");
  const searches = view.rounds.flatMap((round) =>
    round.searches.map(
      (search) =>
        `- Round ${round.no}: "${search.query.query}", ${describeSearch(search.outcome)}`,
    ),
  );
  lines.push(...(searches.length > 0 ? searches : ["The run made no search."]));
  return `${lines.join("\n")}\n`;
}
