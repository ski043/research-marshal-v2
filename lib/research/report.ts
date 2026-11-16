import type {
  BlockContent,
  ListItem,
  PhrasingContent,
  RootContent,
  Text,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";
import type { ClaimNumber, Question, StoppedBy } from "./events";
import type { RunView, VerifiedClaim } from "./run-view";

const CITATION = /\[\^(\d+)\]/g;
const CITATION_GROUP = /\[\^(\d+(?:\s*,\s*\^?\d+)+)\]/g;
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

type Cleaned = { markdown: string; endsInList: boolean };

function cleanMarkdown(markdown: string): Cleaned {
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
  const markdownOut = toMarkdown(
    { type: "root", children },
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

function cleanBody(
  text: string,
  known: ReadonlySet<number>,
): Cleaned & { removed: number[] } {
  const removed: number[] = [];
  const marked = text
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
