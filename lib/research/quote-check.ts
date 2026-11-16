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
// Notes in a row share one mark: `[1], [2]` or `[12](#a),[13](#b)`. The comma
// or dash between them goes with them.
const BETWEEN_NOTES = String.raw`\s*[,\u2013-]\s*`;
const ONE_MARK = String.raw`\[[*_]*(?:\^?\d{1,3}(?:[,\u2013-]\d{1,3})*|[a-z]|note \d{1,3}|citation needed|edit)[*_]*\]`;
const REFERENCE_MARK = new RegExp(
  String.raw`\s*${ONE_MARK}(?:${BETWEEN_NOTES}${ONE_MARK})*`,
  "g",
);
const NOTE = String.raw`[*_]*(?:\^?\d{1,3}(?:[,\u2013-]\d{1,3})*|[a-z]|note \d{1,3})[*_]*`;
const NOTE_TEXT = String.raw`\[(?:${NOTE}|\\\[${NOTE}\\\])\]`;
const LINK_TITLE = String.raw`(?:\s+(?:"[^"]*"|'[^']*'))?`;
// A note link touches the word before it, as in `fell.[43](#R43)` or
// `effects[14](/articles/x#ref-CR14)`. After a space the linked text is part
// of the sentence, as in `Fig. [4](#Fig4)`.
const ONE_NOTE_LINK = String.raw`${NOTE_TEXT}\([^()\s#]*#[^()\s]*${LINK_TITLE}\)`;
const NOTE_LINK = new RegExp(
  // Every link of the group touches what stands before it. A linked number
  // after a space, as in `Figs.[1](#a), [2](#b)`, stays part of the sentence.
  String.raw`(?<=\S)${ONE_NOTE_LINK}(?:[,\u2013-]${ONE_NOTE_LINK})*`,
  "g",
);
// Comment syntax inside a code block or a code span is page text.
const CODE_OR_COMMENT =
  /(^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\2[^\n]*$|(?![\s\S]))|`[^`\n]+`)|<!--[\s\S]*?(?:-->|(?![\s\S]))/gm;
const HTML_BLOCK =
  /<\/?(?:p|div|li|ul|ol|h[1-6]|table|thead|tbody|tr|td|th|blockquote|dd|dt)\b[^<>]*>/gi;
const BLANK_LINE = /^[ \t]*(?:>[ \t]*)*$/;
const HEADING_LINE = /^[ \t]*(?:>[ \t]*)*#{1,6}(?:[ \t]|$)/;
const TABLE_ROW = /^[ \t]*(?:>[ \t]*)*\|/;
const TABLE_SEPARATOR =
  /^[ \t]*(?:>[ \t]*)*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/;
const CELL_BREAK = /(?<!\\)\|/;
const BULLET_ITEM = /^[ \t]*(?:>[ \t]*)*[-*+][ \t]+/;
const NUMBERED_ITEM = /^[ \t]*(?:>[ \t]*)*(\d{1,9})[.)][ \t]+/;
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

const dropComments = (text: string) =>
  text.replace(CODE_OR_COMMENT, (match, code?: string) =>
    code === undefined ? "" : match,
  );

// A mark glued to the next word, as in `risk.[43](#R43)Drinking`, still
// separates the two words.
const withoutMark = (mark: string, at: number, text: string) =>
  /[\p{L}\p{N}]/u.test(text.charAt(at + mark.length)) ? " " : "";

// Runs before linksToTheirText, which would leave the bare note number behind.
const dropNoteLinks = (text: string) => text.replace(NOTE_LINK, withoutMark);

const linksToTheirText = (text: string) =>
  replaceUntilStable(text.replace(IMAGE, ""), LINK, "$1");

const unescapeMarkdown = (text: string) =>
  text.replace(/\\([!-/:-@[-`{-~])/g, "$1");

const dropReferenceMarks = (text: string) =>
  text.replace(REFERENCE_MARK, withoutMark);

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
  dropNoteLinks,
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

const cellsOf = (row: string) => row.split(CELL_BREAK);

// A table can leave out its outer pipes. Its separator row marks the header
// row above it and the rows below it.
function tableRowsOf(lines: readonly string[]): Set<number> {
  const rows = new Set<number>();
  for (const [i, line] of lines.entries()) {
    if (!TABLE_SEPARATOR.test(line)) continue;
    if (CELL_BREAK.test(lines[i - 1] ?? "")) rows.add(i - 1);
    for (let k = i + 1; CELL_BREAK.test(lines[k] ?? ""); k += 1) rows.add(k);
  }
  return rows;
}

// A quote must sit inside one block: a paragraph, a heading, a list item or a
// table cell.
function blocksOf(markdown: string): string[] {
  const blocks: string[] = [];
  let lines: string[] = [];
  let inItem = false;
  const close = () => {
    if (lines.length > 0) blocks.push(lines.join("\n"));
    lines = [];
    inItem = false;
  };
  const all = dropComments(markdown).replace(HTML_BLOCK, "\n\n").split("\n");
  const tableRows = tableRowsOf(all);
  for (const [i, line] of all.entries()) {
    if (BLANK_LINE.test(line) || RULE_LINE.test(line)) {
      close();
    } else if (HEADING_LINE.test(line)) {
      close();
      blocks.push(line);
    } else if (TABLE_ROW.test(line) || tableRows.has(i)) {
      close();
      blocks.push(...cellsOf(line));
    } else {
      const number = NUMBERED_ITEM.exec(line)?.[1];
      // As in CommonMark, only a list that starts at 1 interrupts a paragraph.
      const startsItem =
        BULLET_ITEM.test(line) ||
        (number !== undefined && (inItem || number === "1"));
      if (startsItem) {
        close();
        inItem = true;
      }
      lines.push(line);
    }
  }
  close();
  return blocks;
}

function wordsOf(text: string): string[] {
  const canon = canonical(text);
  return canon === "" ? [] : canon.split(" ");
}

const OPENING = /^["'([]*$/;
const CLOSING = /^["')\].,;:!?]*$/;
// The reader can turn a superscript note mark into plain digits, as in
// `antiquity.1`. Only a quote that ends on a word may leave them out.
const NOTE_DIGITS = /^[.,;:!?]["')\]]*\d{1,3}$/;
const ENDS_ON_WORD = /\p{L}{2}$/u;
// A page can leave out the space between two sentences, as in
// `haemorrhages.These`. The quote may end or start at that sentence break.
// A break has a lowercase word before it and a capitalized word after it, so
// a dotted name in capitals such as `ASP.NET` is not one.
const NEXT_SENTENCE = /^[.!?]["'”’)\]]*\p{Lu}\p{Ll}/u;
const SENTENCE_BEFORE = /\p{Ll}{2}[.!?]["'”’)\]]*$/u;
const STARTS_SENTENCE = /^\p{Lu}\p{Ll}/u;
const ENDS_ON_LOWERCASE = /\p{Ll}{2}$/u;

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
    const beforeOk =
      at === "end"
        ? before === ""
        : OPENING.test(before) ||
          (STARTS_SENTENCE.test(word) && SENTENCE_BEFORE.test(before));
    const afterOk =
      at === "start"
        ? after === ""
        : CLOSING.test(after) ||
          (ENDS_ON_WORD.test(word) && NOTE_DIGITS.test(after)) ||
          (ENDS_ON_LOWERCASE.test(word) && NEXT_SENTENCE.test(after));
    if (beforeOk && afterOk) return true;
  }
  return false;
}

function blockContains(block: readonly string[], words: string[]): boolean {
  const first = words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  const n = words.length;
  for (let i = 0; i + n <= block.length; i += 1) {
    const head = block[i] ?? "";
    if (n === 1) {
      if (edgeMatches(head, first, "both")) return true;
      continue;
    }
    if (!edgeMatches(head, first, "start")) continue;
    let inner = true;
    for (let k = 1; k < n - 1 && inner; k += 1)
      inner = block[i + k] === words[k];
    if (inner && edgeMatches(block[i + n - 1] ?? "", last, "end")) return true;
  }
  return false;
}

export class QuotablePage {
  readonly #blocks: readonly (readonly string[])[];

  constructor(markdown: string) {
    this.#blocks = blocksOf(markdown)
      .map(wordsOf)
      .filter((words) => words.length > 0);
  }

  contains(quote: string): QuoteCheck {
    const words = quoteWords(quote);
    if (words.length === 0) return { found: false, reason: "empty-quote" };
    return this.#blocks.some((block) => blockContains(block, words))
      ? { found: true }
      : { found: false, reason: "not-on-page" };
  }
}
