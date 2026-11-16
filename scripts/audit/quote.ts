// An independent V1 check. It shares no code with lib/research/quote-check.ts on purpose:
// two implementations that agree are evidence, one implementation checking itself is not.
//
// Rule: markup, whitespace and punctuation do not count. Letters, digits and their case do.
// The quote must appear as a contiguous run of the page's words.

const INVISIBLE = /[­​-‍⁠﻿]/g;
const LINK_TARGET = String.raw`\((?:[^()\s]|\([^()\s]*\))*(?:\s+"[^"]*")?\)`;
const LINK_TEXT = String.raw`(?:\\.|[^\[\]\\])*`;
const IMAGE = new RegExp(String.raw`!\[${LINK_TEXT}\]${LINK_TARGET}`, "g");
// A bare number that links to a fragment is a footnote: `[14](/a#ref-CR14 "…")`, `[\[5\]](#cite_note-5)`.
const FOOTNOTE_LINK = new RegExp(
  String.raw`\[(?:\\\[)?\^?\d{1,3}(?:\\\])?\](?=\([^)\s]*#)${LINK_TARGET}`,
  "g",
);
const LINK = new RegExp(String.raw`\[(${LINK_TEXT})\]${LINK_TARGET}`, "g");
const AUTOLINK = /<(https?:\/\/[^<>\s]+)>/g;
const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g;
const ESCAPE = /\\([!-/:-@[-`{-~])/g;
// Footnote and edit marks are page furniture, not words of the passage.
const REFERENCE_MARK =
  /\[\^?(?:\d{1,3}|[a-z]|citation needed|edit|note \d{1,3})\]/gi;
const WORD = /[\p{L}\p{N}\p{M}]+/gu;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, body: string) => {
      if (body[0] === "#") {
        const code =
          body[1] === "x" || body[1] === "X"
            ? Number.parseInt(body.slice(2), 16)
            : Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    },
  );
}

function untilStable(text: string, step: (text: string) => string): string {
  let current = text;
  for (;;) {
    const next = step(current);
    if (next === current) return current;
    current = next;
  }
}

export function plainText(markdown: string): string {
  const unlinked = untilStable(
    markdown
      .normalize("NFC")
      .replace(INVISIBLE, "")
      .replace(IMAGE, " ")
      .replace(FOOTNOTE_LINK, " "),
    (text) => text.replace(LINK, " $1 "),
  );
  return decodeEntities(
    unlinked.replace(AUTOLINK, " $1 ").replace(HTML_TAG, " "),
  )
    .replace(ESCAPE, "$1")
    .replace(REFERENCE_MARK, " ");
}

export function wordsOf(markdown: string): string[] {
  return plainText(markdown).match(WORD) ?? [];
}

const SEP = "\u0001";

export type QuoteVerdict =
  | { found: true }
  | { found: false; reason: "empty-quote" }
  | {
      found: false;
      reason: "not-on-page";
      closest: { matched: number; of: number; pageText: string };
    };

export class PageWords {
  readonly words: readonly string[];
  readonly #key: string;

  constructor(markdown: string) {
    this.words = wordsOf(markdown);
    this.#key = `${SEP}${this.words.join(SEP)}${SEP}`;
  }

  find(quote: string): QuoteVerdict {
    const words = wordsOf(quote);
    if (words.length === 0) return { found: false, reason: "empty-quote" };
    if (this.#key.includes(`${SEP}${words.join(SEP)}${SEP}`)) {
      return { found: true };
    }
    return {
      found: false,
      reason: "not-on-page",
      closest: this.#closest(words),
    };
  }

  // The page window that shares the most words with the quote, so a miss can be explained
  // with the page's own text.
  #closest(words: readonly string[]) {
    const n = words.length;
    const wanted = new Set(words);
    let best = { score: -1, at: 0 };
    for (let i = 0; i + n <= this.words.length; i += 1) {
      let score = 0;
      for (let k = 0; k < n; k += 1) {
        if (wanted.has(this.words[i + k] ?? "")) score += 1;
      }
      if (score > best.score) best = { score, at: i };
    }
    return {
      matched: Math.max(best.score, 0),
      of: n,
      pageText: this.words.slice(best.at, best.at + n).join(" "),
    };
  }
}
