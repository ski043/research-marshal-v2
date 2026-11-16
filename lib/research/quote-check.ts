export type QuoteCheck =
  | { found: true }
  | { found: false; reason: "empty-quote" | "not-on-page" };

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

const LINK_TEXT = String.raw`(?:\\.|[^\[\]\\]|\[(?:\\.|[^\[\]\\])*\])*`;
const LINK_TARGET = String.raw`(?:[^()\s]|\([^()\s]*\))*(?:\s+(?:"[^"]*"|'[^']*'))?`;
const IMAGE = new RegExp(String.raw`!\[${LINK_TEXT}\]\(${LINK_TARGET}\)`, "g");
const LINK = new RegExp(String.raw`\[(${LINK_TEXT})\]\(${LINK_TARGET}\)`, "g");
const REFERENCE_MARK =
  /\s*\[[*_]*(?:\^?\d{1,3}|[a-z]|note \d{1,3}|citation needed|edit)[*_]*\]/g;
const LINE_PREFIX =
  /^[ \t]*(?:>[ \t]*)*(?:#{1,6}(?=[ \t]|$))?[ \t]*(?:[-*+][ \t]+)?(?:\[[ xX]\][ \t]+)?/;
const RULE_LINE = /^[ \t]*[-=*_|:][-=*_|: \t]*$/;

const CHARACTER_MAP: [RegExp, string][] = [
  [/\s/gu, " "],
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″«»]/g, '"'],
  [/[‐‑‒–−]/g, "-"],
  [/[—―]/g, " - "],
  [/…/g, "..."],
];

function replaceUntilStable(text: string, pattern: RegExp, by: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(pattern, by);
  } while (current !== previous);
  return current;
}

const LIGATURES: Record<string, string> = {
  "\uFB00": "ff",
  "\uFB01": "fi",
  "\uFB02": "fl",
  "\uFB03": "ffi",
  "\uFB04": "ffl",
  "\uFB05": "st",
  "\uFB06": "st",
};

// NFKC would also turn a superscript or subscript digit into a plain digit, and
// "10\u00B2 mg" would then match the quote "102 mg".
const foldLetterForms = (text: string) =>
  text
    .normalize("NFC")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\uFB00-\uFB06]/g, (ligature) => LIGATURES[ligature] ?? ligature)
    .replace(/[\uFF01-\uFF5E]/g, (wide) =>
      String.fromCharCode(wide.charCodeAt(0) - 0xfee0),
    );

const htmlToText = (text: string) =>
  text
    .replace(/<(https?:\/\/[^<>\s]+)>/g, "$1")
    .replace(/<br\s*\/?>|<\/?su[bp]\b[^<>]*>/gi, " ")
    .replace(/<\/?[a-zA-Z][^<>]*>/g, "")
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|#39|apos);/g,
      (entity) => ENTITIES[entity] ?? entity,
    );

const linksToTheirText = (text: string) =>
  replaceUntilStable(text.replace(IMAGE, ""), LINK, "$1");

const unescapeMarkdown = (text: string) =>
  text.replace(/\\([!-/:-@[-`{-~])/g, "$1");

const dropReferenceMarks = (text: string) => text.replace(REFERENCE_MARK, "");

const dropLineMarks = (text: string) =>
  text
    .split("\n")
    .map((line) => (RULE_LINE.test(line) ? "" : line.replace(LINE_PREFIX, "")))
    .join("\n");

const dropEmphasisMarks = (text: string) =>
  text
    .replace(/[*`]|~~/g, "")
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, "")
    .replace(/\|/g, " ");

const unifyTypography = (text: string) =>
  CHARACTER_MAP.reduce((out, [pattern, by]) => out.replace(pattern, by), text);

const collapseSpaces = (text: string) => text.replace(/ {2,}/g, " ").trim();

const CANONICAL_STEPS = [
  foldLetterForms,
  htmlToText,
  linksToTheirText,
  unescapeMarkdown,
  dropReferenceMarks,
  dropLineMarks,
  dropEmphasisMarks,
  unifyTypography,
  collapseSpaces,
];

export function canonical(text: string): string {
  return CANONICAL_STEPS.reduce((out, step) => step(out), text);
}

function wordsOf(text: string): string[] {
  const canon = canonical(text);
  return canon === "" ? [] : canon.split(" ");
}

const OPENING = /^["'([]*$/;
const CLOSING = /^["')\].,;:!?]*$/;

function trimStart(word: string): string {
  let out = word;
  for (;;) {
    const next = out.replace(/^(?:["'([]|\.\.\.)/, "");
    if (next === out) return out;
    out = next;
  }
}

function trimEnd(word: string): string {
  return word.replace(/["')\].,;:!?]+$/, "");
}

function quoteWords(quote: string): string[] {
  const words = wordsOf(quote);
  while (words.length > 0) {
    const first = trimStart(words[0] ?? "");
    if (first !== "") {
      words[0] = first;
      break;
    }
    words.shift();
  }
  while (words.length > 0) {
    const last = trimEnd(words[words.length - 1] ?? "");
    if (last !== "") {
      words[words.length - 1] = last;
      break;
    }
    words.pop();
  }
  return words;
}

function edgeMatches(
  pageWord: string,
  word: string,
  at: "start" | "end" | "both",
): boolean {
  for (
    let from = pageWord.indexOf(word);
    from !== -1;
    from = pageWord.indexOf(word, from + 1)
  ) {
    const before = pageWord.slice(0, from);
    const after = pageWord.slice(from + word.length);
    const beforeOk = at === "end" ? before === "" : OPENING.test(before);
    const afterOk = at === "start" ? after === "" : CLOSING.test(after);
    if (beforeOk && afterOk) return true;
  }
  return false;
}

export class QuotablePage {
  readonly #words: readonly string[];

  constructor(markdown: string) {
    this.#words = wordsOf(markdown);
  }

  contains(quote: string): QuoteCheck {
    const words = quoteWords(quote);
    const first = words[0];
    const last = words[words.length - 1];
    if (first === undefined || last === undefined) {
      return { found: false, reason: "empty-quote" };
    }
    const page = this.#words;
    const n = words.length;
    for (let i = 0; i + n <= page.length; i += 1) {
      const head = page[i] ?? "";
      if (n === 1) {
        if (edgeMatches(head, first, "both")) return { found: true };
        continue;
      }
      if (!edgeMatches(head, first, "start")) continue;
      let inner = true;
      for (let k = 1; k < n - 1 && inner; k += 1)
        inner = page[i + k] === words[k];
      if (inner && edgeMatches(page[i + n - 1] ?? "", last, "end")) {
        return { found: true };
      }
    }
    return { found: false, reason: "not-on-page" };
  }
}
