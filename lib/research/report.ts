import type {
  BlockContent,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Text,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";
import type { CitationCheck, ClaimNumber, Question, StoppedBy } from "./events";
import {
  MalformedAnswer,
  type ModelSteps,
  type SentenceRepair,
} from "./model-config";
import type { RunView, VerifiedClaim } from "./run-view";

const CITATION = /\[\^(\d+)\]/g;
const CITATION_GROUP = /\[\^(\d+(?:\s*,\s*\^?\d+)+)\]/g;
// A definition and its indented continuation lines. It must go before the
// marks do, or its text stays behind as report prose.
const FOOTNOTE_DEFINITION =
  /^[ \t]{0,3}\[\^\d+\]:[^\n]*(?:\n(?:[ \t]{2,}|\t)[^\n]*)*\n?/gm;
const SOURCE_HEADING =
  /^#{1,6}[ \t]+(?:sources|references|bibliography|citations)[ \t]*:?[ \t]*$/gim;
// Control characters and the bidi overrides that reorder text on screen.
const CONTROL = /(?![\t\n])\p{Cc}|[\u202A-\u202E\u2066-\u2069]/gu;
// Placeholders that carry a citation mark through the parser as plain text.
const MARK_OPEN = "\uE000";
const MARK_CLOSE = "\uE001";
const MARKS = /[\uE000\uE001]/g;
const PROTECTED_MARK = /(!?)\uE000(\d+)\uE001(?=([(:])?)/g;
// Characters that start a Markdown, GFM or HTML construct inside link text.
// Newlines are gone by then, so line-start constructs cannot form.
const TEXT_SPECIAL = /[\\[\]!<>&`*_~|]/g;
// GFM turns bare URLs and emails into links from the decoded text after the
// parse, so no escape stops it. A word joiner inside the trigger does.
const LINK_TRIGGER = /(?<=https?)(?=:\/\/)|(?<=www)(?=\.)|(?<=@)(?!\u2060)/gi;
const URL_SAFE = /%[0-9A-Fa-f]{2}|[A-Za-z0-9!#$&'*+,\-./:;=?@_~()]/y;
const TITLE_MAX = 200;
// A live segment ends after a blank line, or before a line that starts a
// heading or a top-level list item.
const SEGMENT_END =
  /\n[ \t]*\n(?:[ \t]*\n)*|\n(?=(?:#{1,6}|[-*+]|\d{1,9}[.)])[ \t])/g;
const LIST_ITEM_START = /^(?:[-*+]|\d{1,9}[.)])[ \t]/;
const SENTENCES = new Intl.Segmenter("en", { granularity: "sentence" });
// Intl.Segmenter ends a sentence after these words when a capital follows.
const ABBREVIATION =
  /(?:^|[\s(])(?:e\.g|i\.e|cf|vs|approx|ca|Dr|Mr|Mrs|Ms|Prof|St|Fig|Figs|Eq|Vol|pp|al)\.$/;
// `No. 5` goes on, but `No.` alone is an answer.
const NUMBER_ABBREVIATION = /(?:^|[\s(])Nos?\.$/;
// An initial stands at the start, after a name, after another initial, or
// after a word that introduces a name, as in `John F. Kennedy` and
// `by J. Smith`. After any other lowercase word, as in `vitamin D.`, the
// capital ends the sentence.
const INITIAL =
  /(?:^|\(|[,;]\s|\b(?:by|and|of|from|with|to|see|per)\s|\p{Lu}[\p{L}'’-]*\s|\p{Lu}\.\s?)\p{Lu}\.$/u;

function goesOn(before: string, next: string): boolean {
  return (
    ABBREVIATION.test(before) ||
    (NUMBER_ABBREVIATION.test(before) && /^\s*\d/.test(next)) ||
    (INITIAL.test(before) && before.trim().length > 2)
  );
}
const PROTECTED = /\uE000(\d+)\uE001/g;
const LEADING_MARKS = /^\s*(?:\uE000\d+\uE001\s*)+/;
const ONLY_MARKS = /^\s*(?:\uE000\d+\uE001\s*)*$/;
// What may follow the last word of a sentence: closing punctuation, spaces
// and citation marks.
const SENTENCE_TAIL = /(?:[\s.!?…"'”’»)\]]|\uE000\d+\uE001)*$/;
const TERMINAL = /[.!?…]+$/;

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

function textNode(value: string): Text {
  return { type: "text", value };
}

// Joins neighbouring text the way a parser of the output will see it, then
// breaks every bare URL and email in it.
function unlinked(nodes: readonly PhrasingContent[]): PhrasingContent[] {
  const joined: PhrasingContent[] = [];
  for (const node of nodes) {
    const last = joined.at(-1);
    if (node.type === "text" && last?.type === "text") {
      joined[joined.length - 1] = textNode(last.value + node.value);
    } else {
      joined.push(node);
    }
  }
  return joined.map((node) =>
    node.type === "text"
      ? textNode(node.value.replace(LINK_TRIGGER, "\u2060"))
      : node,
  );
}

function phrasing(nodes: readonly PhrasingContent[]): PhrasingContent[] {
  const kept = nodes.flatMap((node): PhrasingContent[] => {
    switch (node.type) {
      case "text":
      case "break":
        return [node];
      case "emphasis":
      case "strong": {
        const children = phrasing(node.children);
        return children.length === 0 ? [] : [{ ...node, children }];
      }
      case "link":
      case "linkReference":
      case "delete":
        return phrasing(node.children);
      case "image":
      case "imageReference":
        return node.alt ? [textNode(node.alt)] : [];
      case "inlineCode":
        return [textNode(node.value)];
      default:
        return [];
    }
  });
  return unlinked(kept);
}

function hasText(nodes: readonly PhrasingContent[]): boolean {
  return nodes.some((node) =>
    node.type === "text" ? node.value.trim() !== "" : node.type !== "break",
  );
}

function paragraphOf(nodes: PhrasingContent[]): BlockContent[] {
  const children = unlinked(nodes);
  return hasText(children) ? [{ type: "paragraph", children }] : [];
}

function listItem(item: ListItem): ListItem[] {
  const children = blocks(item.children);
  return children.length === 0 ? [] : [{ ...item, checked: null, children }];
}

// The report allowlist: headings, paragraphs, lists, emphasis, text and line
// breaks. Links keep their text, images their alt text, code its text, and a
// quote or a table its content. Everything else goes.
function blocks(nodes: readonly RootContent[]): BlockContent[] {
  return nodes.flatMap((node): BlockContent[] => {
    switch (node.type) {
      case "paragraph":
        return paragraphOf(phrasing(node.children));
      case "heading": {
        const children = phrasing(node.children);
        return hasText(children) ? [{ ...node, children }] : [];
      }
      case "list": {
        const children = node.children.flatMap(listItem);
        return children.length === 0 ? [] : [{ ...node, children }];
      }
      case "blockquote":
        return blocks(node.children);
      case "code":
        return paragraphOf([textNode(node.value)]);
      case "table":
        return node.children.flatMap((row) =>
          paragraphOf(
            row.children.flatMap((cell, i) => {
              const content = phrasing(cell.children);
              if (!hasText(content)) return [];
              return i === 0 ? content : [textNode(" · "), ...content];
            }),
          ),
        );
      default:
        return [];
    }
  });
}

type Span = { start: number; end: number };

// The text of a paragraph as a sentence splitter sees it. Citation marks are
// still placeholders here.
function flatText(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.value;
        case "break":
          return "\n";
        case "emphasis":
        case "strong":
          return flatText(node.children);
        default:
          return "";
      }
    })
    .join("");
}

// Replaces the characters [start, end) of the flat text with `insert`.
// Emphasis that loses all its text goes too.
function splice(
  nodes: readonly PhrasingContent[],
  start: number,
  end: number,
  insert: string,
): PhrasingContent[] {
  let offset = 0;
  let inserted = insert === "";
  const walk = (list: readonly PhrasingContent[]): PhrasingContent[] =>
    list.flatMap((node): PhrasingContent[] => {
      switch (node.type) {
        case "text": {
          const from = offset;
          offset += node.value.length;
          const at = (i: number) =>
            Math.min(Math.max(i - from, 0), node.value.length);
          let value = node.value.slice(0, at(start));
          if (!inserted && start <= offset) {
            value += insert;
            inserted = true;
          }
          value += node.value.slice(at(end));
          return value === "" ? [] : [textNode(value)];
        }
        case "break": {
          offset += 1;
          return offset > start && offset <= end ? [] : [node];
        }
        case "emphasis":
        case "strong": {
          const children = walk(node.children);
          return hasText(children) ? [{ ...node, children }] : [];
        }
        default:
          return [node];
      }
    });
  const out = walk(nodes);
  return unlinked(inserted ? out : [...out, textNode(insert)]);
}

function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const { index, segment } of SENTENCES.segment(text)) {
    const last = spans.at(-1);
    const end = index + segment.length;
    if (
      last &&
      (goesOn(text.slice(last.start, last.end).trimEnd(), segment) ||
        /^\s*[a-z]/.test(segment) ||
        ONLY_MARKS.test(segment))
    ) {
      last.end = end;
    } else {
      spans.push({ start: index, end });
    }
  }
  // A citation mark after the closing period belongs to the sentence before.
  for (const [i, span] of spans.entries()) {
    const before = spans[i - 1];
    const lead = LEADING_MARKS.exec(text.slice(span.start, span.end));
    if (before && lead) {
      before.end += lead[0].length;
      span.start += lead[0].length;
    }
  }
  return spans.filter((span) =>
    /[\p{L}\p{N}]/u.test(
      text.slice(span.start, span.end).replace(PROTECTED, ""),
    ),
  );
}

function paragraphsIn(
  nodes: readonly (BlockContent | ListItem["children"][number])[],
): Paragraph[] {
  return nodes.flatMap((node): Paragraph[] => {
    if (node.type === "paragraph") return [node];
    if (node.type === "list") {
      return node.children.flatMap((item) => paragraphsIn(item.children));
    }
    return [];
  });
}

type Located = {
  paragraph: Paragraph;
  flat: string;
  span: Span;
  text: string;
  citations: readonly number[];
  opening: boolean;
};

function locate(children: readonly BlockContent[]): Located[] {
  const first = children.find((block) => block.type !== "heading");
  // The direct answer can be the first item of a list.
  const opening = new Set(
    first?.type === "list"
      ? paragraphsIn(first.children[0]?.children ?? [])
      : first?.type === "paragraph"
        ? [first]
        : [],
  );
  return paragraphsIn(children).flatMap((paragraph) => {
    const flat = flatText(paragraph.children);
    return sentenceSpans(flat).map((span) => {
      const raw = flat.slice(span.start, span.end);
      return {
        paragraph,
        flat,
        span,
        text: raw.replace(PROTECTED, "[^$1]").trim(),
        citations: [...raw.matchAll(PROTECTED)].map((m) => Number(m[1])),
        opening: opening.has(paragraph),
      };
    });
  });
}

// Puts the citation marks that end a sentence in one place: after the last
// word, before the closing period, as in "text [^2][^5]."
function normalizeCitations(children: readonly BlockContent[]): void {
  for (const paragraph of paragraphsIn(children)) {
    const flat = flatText(paragraph.children);
    for (const span of sentenceSpans(flat).reverse()) {
      const body = flat.slice(span.start, span.end).trimEnd();
      const at = body.search(SENTENCE_TAIL);
      const tail = body.slice(at);
      const marks = tail.match(PROTECTED);
      if (!marks) continue;
      const rest = tail.replace(PROTECTED, "").replace(/\s+/g, "");
      const terminal = TERMINAL.exec(rest)?.[0] ?? "";
      const joined = [...new Set(marks)].join("");
      const next = `${rest.slice(0, rest.length - terminal.length)} ${joined}${terminal}`;
      if (next !== tail) {
        paragraph.children = splice(
          paragraph.children,
          span.start + at,
          span.start + body.length,
          next,
        );
      }
    }
  }
}

type Cleaned = { markdown: string; endsInList: boolean };

function serialize(children: readonly BlockContent[]): Cleaned {
  const markdownOut = toMarkdown(
    { type: "root", children: [...children] },
    {
      bullet: "-",
      emphasis: "*",
      strong: "*",
      listItemIndent: "one",
      extensions: [gfmToMarkdown()],
    },
  );
  // A mark followed by ( or : would read as a link or a definition.
  const restored = markdownOut
    .replace(
      PROTECTED_MARK,
      (_, bang: string, digits: string, next?: string) =>
        `${bang && "\\!"}[^${digits}]${next ? "\\" : ""}`,
    )
    .trimEnd();
  return { markdown: restored, endsInList: children.at(-1)?.type === "list" };
}

function cleanMarkdown(markdown: string): Cleaned {
  return serialize(parseMarkdown(markdown));
}

function parseMarkdown(markdown: string): BlockContent[] {
  const protectedMarks = markdown
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(MARKS, "")
    .replace(
      /(^[ \t]{0,3})?\[\^(\d+)\](:)?/gm,
      (mark: string, lead?: string, digits?: string, colon?: string) =>
        lead !== undefined && colon
          ? mark
          : `${lead ?? ""}${MARK_OPEN}${digits}${MARK_CLOSE}${colon ?? ""}`,
    );
  const tree = fromMarkdown(protectedMarks, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const children = blocks(tree.children);
  normalizeCitations(children);
  return children;
}

function markCitations(
  text: string,
  known: ReadonlySet<number>,
): { marked: string; removed: number[] } {
  const removed: number[] = [];
  const marked = text
    .replace(FOOTNOTE_DEFINITION, "")
    .replace(CITATION_GROUP, (_, group: string) =>
      group
        .split(",")
        .map((part) => `[^${part.trim().replace(/^\^/, "")}]`)
        .join(""),
    )
    .replace(/[ \t]*\[\^(\d+)\]/g, (mark: string, digits: string) => {
      const number = Number(digits);
      if (known.has(number)) return mark;
      if (!removed.includes(number)) removed.push(number);
      return "";
    });
  return { marked, removed };
}

function cleanBody(
  text: string,
  known: ReadonlySet<number>,
): Cleaned & { removed: number[] } {
  const { marked, removed } = markCitations(text, known);
  return { ...cleanMarkdown(marked), removed };
}

// One line of web or model text, safe inside a link text or a sentence.
function plainText(text: string, max = Number.POSITIVE_INFINITY): string {
  const line = text.replace(/\s+/g, " ").replace(CONTROL, "").trim();
  const chars = [...line];
  const short =
    chars.length > max
      ? `${chars
          .slice(0, max - 1)
          .join("")
          .trimEnd()}…`
      : line;
  return short.replace(TEXT_SPECIAL, "\\$&").replace(LINK_TRIGGER, "\u2060");
}

// Percent-encodes what a Markdown link destination cannot hold as is and
// escapes the parentheses, so the href stays the page URL.
function linkDestination(url: string): string {
  let out = "";
  let i = 0;
  while (i < url.length) {
    URL_SAFE.lastIndex = i;
    const safe = URL_SAFE.exec(url)?.[0];
    if (safe !== undefined) {
      out += safe === "(" || safe === ")" ? `\\${safe}` : safe;
      i += safe.length;
      continue;
    }
    const char = String.fromCodePoint(url.codePointAt(i) ?? 0xfffd);
    for (const byte of new TextEncoder().encode(char)) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
    i += char.length;
  }
  return out;
}

export function finalizeReport(
  draft: string,
  verified: readonly VerifiedClaim[],
): FinalReport {
  const byNumber = new Map<number, VerifiedClaim>(
    verified.map((claim) => [claim.number, claim]),
  );
  const { markdown: body, removed } = cleanBody(
    cutSourceSection(draft),
    new Set(byNumber.keys()),
  );

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
    const text = plainText(title, TITLE_MAX) || plainText(domain);
    return `- [${text}](${linkDestination(url)}) · ${plainText(domain)} · ${plainText(label)} · ${marks}`;
  });

  const markdown =
    list.length === 0
      ? `${body}\n`
      : `${body}\n\n## Sources\n\n${list.join("\n")}\n`;
  return { markdown, cited, removedCitations: removed };
}

export type LiveReport = {
  // Takes the next chunk of the draft and returns the cleaned text of every
  // segment that the chunk completes, or "".
  push: (chunk: string) => string;
  // Returns the cleaned text of the rest of the draft, or "".
  end: () => string;
};

// Cleans the draft while the model writes it, with the same rules as
// finalizeReport. A construct can span two chunks, so the live text grows one
// segment at a time: a paragraph, a heading or a list item.
export function liveReport(verified: readonly VerifiedClaim[]): LiveReport {
  const known = new Set<number>(verified.map((claim) => claim.number));
  let pending = "";
  let held: string | null = null;
  let endedTight = false;

  // Segments join with a blank line, as blocks do in the final report, except
  // between two items of one list. `next` is null after the last segment.
  const release = (raw: string, next: string | null): string => {
    const { markdown, endsInList } = cleanBody(raw, known);
    if (markdown === "") return "";
    const lead = endedTight && !LIST_ITEM_START.test(raw) ? "\n" : "";
    endedTight = next === null || (endsInList && LIST_ITEM_START.test(next));
    return `${lead}${markdown}${endedTight ? "\n" : "\n\n"}`;
  };

  return {
    push(chunk) {
      if (held !== null) {
        held += chunk;
        return "";
      }
      pending += chunk;
      let end = 0;
      for (const match of pending.matchAll(SEGMENT_END)) {
        end = match.index + match[0].length;
      }
      if (end === 0) return "";
      let ready = pending.slice(0, end);
      pending = pending.slice(end);
      const heading = ready.search(SOURCE_HEADING);
      if (heading !== -1) {
        held = ready.slice(heading) + pending;
        pending = "";
        ready = ready.slice(0, heading);
      }
      return release(ready, pending);
    },
    end() {
      const rest = held === null ? pending : cutSourceSection(held);
      pending = "";
      held = null;
      return release(rest, null);
    },
  };
}

function describeSearch(
  outcome: RunView["rounds"][number]["searches"][number]["outcome"],
): string {
  if (outcome === null) return "did not finish";
  if (outcome.status === "failed") {
    return `failed (${outcome.failure.kind}: ${plainText(outcome.failure.detail)})`;
  }
  const n = outcome.results.length;
  return n === 0 ? "no results" : `${n} ${n === 1 ? "result" : "results"}`;
}

export function noClaimsReport(view: RunView): string {
  const lines = [
    "# No verified claims",
    "",
    `Research Marshal could not verify any claim for the question "${plainText(view.question)}". This report therefore states no facts.`,
  ];
  if (view.error) {
    lines.push(
      "",
      `The run stopped early because the step "${plainText(view.error.step)}" failed: ${plainText(view.error.message)}`,
    );
  }
  lines.push("", "## Searches of the run", "");
  const searches = view.rounds.flatMap((round) =>
    round.searches.map(
      (search) =>
        `- Round ${round.no}: "${plainText(search.query.query)}", ${describeSearch(search.outcome)}`,
    ),
  );
  lines.push(...(searches.length > 0 ? searches : ["The run made no search."]));
  return `${lines.join("\n")}\n`;
}

export type DraftSentence = {
  text: string;
  citations: readonly number[];
  opening: boolean;
};

// The sentences of the report body in reading order. Headings and the source
// list hold no sentence.
export function reportSentences(
  draft: string,
  verified: readonly VerifiedClaim[],
): DraftSentence[] {
  const known = new Set<number>(verified.map((claim) => claim.number));
  const { marked } = markCitations(cutSourceSection(draft), known);
  return locate(parseMarkdown(marked)).map(({ text, citations, opening }) => ({
    text,
    citations,
    opening,
  }));
}

type Edit =
  | { at: Located; kind: "remove" }
  | { at: Located; kind: "cite"; claims: readonly number[] }
  | { at: Located; kind: "rewrite"; text: string };

function markOf(number: number): string {
  return `${MARK_OPEN}${number}${MARK_CLOSE}`;
}

// Removes the space that a removed sentence leaves at either end.
function trimEdges(children: PhrasingContent[]): PhrasingContent[] {
  const flat = flatText(children);
  const end = flat.trimEnd().length;
  const trimmed =
    end < flat.length ? splice(children, end, flat.length, "") : children;
  const lead = flat.length - flat.trimStart().length;
  return lead > 0 && end > 0 ? splice(trimmed, 0, lead, "") : trimmed;
}

function applyEdits(
  children: readonly BlockContent[],
  edits: readonly Edit[],
): BlockContent[] {
  const byParagraph = new Map<Paragraph, Edit[]>();
  for (const edit of edits) {
    const list = byParagraph.get(edit.at.paragraph) ?? [];
    list.push(edit);
    byParagraph.set(edit.at.paragraph, list);
  }
  for (const [paragraph, list] of byParagraph) {
    list.sort((a, b) => b.at.span.start - a.at.span.start);
    for (const edit of list) {
      const { span, flat } = edit.at;
      const end =
        span.start + flat.slice(span.start, span.end).trimEnd().length;
      paragraph.children =
        edit.kind === "remove"
          ? splice(paragraph.children, span.start, span.end, "")
          : edit.kind === "cite"
            ? splice(
                paragraph.children,
                end,
                end,
                ` ${edit.claims.map(markOf).join("")}`,
              )
            : splice(paragraph.children, span.start, end, edit.text);
    }
    paragraph.children = trimEdges(paragraph.children);
  }
  const cleaned = blocks(children);
  normalizeCitations(cleaned);
  return cleaned;
}

// A rewrite from the model as plain text. Its citations of verified claims
// stay; any other number goes.
function rewriteOf(
  text: string,
  original: string,
  known: ReadonlySet<number>,
): { text: string; claims: number[]; unknown: number[] } {
  const { marked, removed } = markCitations(
    text.replace(CONTROL, "").replace(MARKS, "").replace(/\s+/g, " ").trim(),
    known,
  );
  const claims: number[] = [];
  let plain = marked.replace(CITATION, (_, digits: string) => {
    const number = Number(digits);
    if (!claims.includes(number)) claims.push(number);
    return markOf(number);
  });
  // Without its period a rewrite would run into the next sentence.
  const ended = (value: string) =>
    /[.!?…]["'”’)\]]*$/.test(value.replace(PROTECTED, "").trimEnd());
  if (plain !== "" && ended(original) && !ended(plain)) plain += ".";
  return { text: plain, claims, unknown: removed };
}

type Judged = CitationCheck["uncited"][number];
type CheckSteps = Pick<ModelSteps, "classifySentences" | "repairSentences">;

async function judge(
  model: CheckSteps,
  question: Question,
  report: string,
  sentences: readonly Located[],
): Promise<Judged[]> {
  let verdicts: Awaited<
    ReturnType<ModelSteps["classifySentences"]>
  >["verdicts"];
  try {
    ({ verdicts } = await model.classifySentences({
      question,
      report,
      sentences: sentences.map((sentence) => sentence.text),
    }));
  } catch (error) {
    if (!(error instanceof MalformedAnswer)) throw error;
    verdicts = [];
  }
  return sentences.map((sentence, i) => {
    const answer = verdicts.find((v) => v.sentence === i + 1);
    return {
      text: sentence.text,
      opening: sentence.opening,
      verdict: answer?.verdict ?? "fact",
      reason: answer?.reason ?? "The check gave no verdict.",
    };
  });
}

async function repair(
  model: CheckSteps,
  input: Parameters<ModelSteps["repairSentences"]>[0],
): Promise<readonly SentenceRepair[]> {
  try {
    return (await model.repairSentences(input)).repairs;
  } catch (error) {
    if (!(error instanceof MalformedAnswer)) throw error;
    return [];
  }
}

export type CheckedReport = {
  draft: string;
  removedCitations: readonly number[];
  check: CitationCheck;
};

// R3: every sentence that states a fact cites a verified claim. A separate
// step judges each sentence without a citation, the writer gets one repair,
// and code removes what still states a fact without one.
export async function checkCitations(input: {
  draft: string;
  question: Question;
  verified: readonly VerifiedClaim[];
  model: CheckSteps;
}): Promise<CheckedReport> {
  const { question, model } = input;
  const known = new Set<number>(input.verified.map((claim) => claim.number));
  const { marked, removed } = markCitations(
    cutSourceSection(input.draft),
    known,
  );
  let children = parseMarkdown(marked);
  const check: CitationCheck = {
    uncited: [],
    repairs: [],
    rewritten: [],
    removed: [],
    modelCalls: 0,
  };
  const done = (): CheckedReport => ({
    draft: serialize(children).markdown,
    removedCitations: removed,
    check,
  });
  const uncited = () =>
    locate(children).filter((sentence) => sentence.citations.length === 0);

  const first = uncited();
  if (first.length === 0) return done();
  check.modelCalls += 1;
  check.uncited = await judge(model, question, done().draft, first);
  const factual = first.flatMap((at, i) =>
    check.uncited[i]?.verdict === "fact" ? [{ at, index: i }] : [],
  );
  if (factual.length === 0) return done();

  check.modelCalls += 1;
  const repairs = await repair(model, {
    question,
    report: done().draft,
    sentences: factual.map(({ at }) => ({
      text: at.text,
      opening: at.opening,
    })),
    claims: input.verified,
  });
  const edits: Edit[] = [];
  for (const [k, { at, index }] of factual.entries()) {
    const answer = repairs.find((r) => r.sentence === k + 1);
    const entry = {
      sentence: index,
      claims: [] as ClaimNumber[],
      unknownClaims: [] as number[],
      text: null as string | null,
    };
    const asClaims = (numbers: readonly number[]) =>
      numbers.flatMap((n) => {
        const claim = input.verified.find((c) => c.number === n);
        return claim ? [claim.number] : [];
      });
    const fail = (by: "repair" | "check") => {
      edits.push({ at, kind: "remove" });
      check.removed.push({ text: at.text, opening: at.opening, by });
    };
    if (answer === undefined) {
      check.repairs.push({ ...entry, action: "none" });
      fail("check");
    } else if (answer.action === "delete") {
      check.repairs.push({ ...entry, action: "delete" });
      fail("repair");
    } else if (answer.action === "cite") {
      const unique = [...new Set(answer.claims)];
      const claims = asClaims(unique);
      check.repairs.push({
        ...entry,
        action: "cite",
        claims,
        unknownClaims: unique.filter((n) => !known.has(n)),
      });
      if (claims.length > 0) edits.push({ at, kind: "cite", claims });
      else fail("check");
    } else {
      const rewrite = rewriteOf(answer.text, at.text, known);
      check.repairs.push({
        ...entry,
        action: "rewrite",
        claims: asClaims(rewrite.claims),
        unknownClaims: rewrite.unknown,
        text: answer.text,
      });
      if (rewrite.text.replace(PROTECTED, "").trim() !== "") {
        edits.push({ at, kind: "rewrite", text: rewrite.text });
      } else {
        fail("check");
      }
    }
  }
  children = applyEdits(children, edits);

  // A rewrite may add a sentence without a citation. It is judged like the
  // draft, and a fact in it is not repaired again.
  const accepted = new Set(
    check.uncited.flatMap((s) => (s.verdict === "fact" ? [] : [s.text])),
  );
  const fresh = uncited().filter((sentence) => !accepted.has(sentence.text));
  if (fresh.length > 0) {
    check.modelCalls += 1;
    check.rewritten = await judge(model, question, done().draft, fresh);
    for (const sentence of check.rewritten) {
      if (sentence.verdict !== "fact") accepted.add(sentence.text);
    }
  }
  const left = uncited().filter((sentence) => !accepted.has(sentence.text));
  for (const at of left) {
    check.removed.push({ text: at.text, opening: at.opening, by: "check" });
  }
  children = applyEdits(
    children,
    left.map((at) => ({ at, kind: "remove" as const })),
  );
  return done();
}
