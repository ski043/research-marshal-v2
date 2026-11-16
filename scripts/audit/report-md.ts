// Parses the stored report Markdown without lib/research/report.ts, so the audit can catch a
// report that the app's own writer got wrong.

export const SOURCE_LABELS = [
  "Paper",
  "Official",
  "Reference",
  "News",
  "Organization",
  "Blog",
  "Forum",
  "Other",
] as const;

export type SourceEntry = {
  line: string;
  title: string;
  url: string;
  domain: string;
  label: string;
  marks: number[];
};

export type ParsedReport = {
  body: string;
  hasSourceList: boolean;
  sources: SourceEntry[];
  unparsedSourceLines: string[];
  bodyCitations: number[];
};

const SOURCE_HEADING = /^#{1,6}[ \t]+Sources[ \t]*$/gim;
const CITATION = /\[\^(\d+)\]/g;
const ENTRY =
  /^-[ \t]+\[((?:\\.|[^\]\\])*)\]\((\S+)\)[ \t]+·[ \t]+(.*?)[ \t]+·[ \t]+(.*?)[ \t]+·[ \t]+((?:\[\^\d+\])+)[ \t]*$/;

function numbersIn(text: string): number[] {
  return [...text.matchAll(CITATION)].map((m) => Number(m[1]));
}

export function parseReport(markdown: string): ParsedReport {
  const headings = [...markdown.matchAll(SOURCE_HEADING)];
  const last = headings.at(-1);
  if (last?.index === undefined) {
    return {
      body: markdown,
      hasSourceList: false,
      sources: [],
      unparsedSourceLines: [],
      bodyCitations: numbersIn(markdown),
    };
  }
  const body = markdown.slice(0, last.index);
  const list = markdown.slice(last.index + last[0].length);
  const sources: SourceEntry[] = [];
  const unparsedSourceLines: string[] = [];
  for (const line of list.split("\n")) {
    if (line.trim() === "") continue;
    const m = ENTRY.exec(line);
    if (!m) {
      unparsedSourceLines.push(line);
      continue;
    }
    sources.push({
      line,
      title: (m[1] ?? "").replace(/\\(.)/g, "$1").trim(),
      // The app escapes a parenthesis in a link destination.
      url: (m[2] ?? "").replace(/\\([!-/:-@[-`{-~])/g, "$1"),
      domain: (m[3] ?? "").trim(),
      label: (m[4] ?? "").trim(),
      marks: numbersIn(m[5] ?? ""),
    });
  }
  return {
    body,
    hasSourceList: true,
    sources,
    unparsedSourceLines,
    bodyCitations: numbersIn(body),
  };
}

export type Block = {
  kind: "heading" | "list" | "table" | "text";
  text: string;
};

export function blocksOf(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "text", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line === "") flush();
    else if (/^#{1,6}[ \t]/.test(line)) {
      flush();
      blocks.push({ kind: "heading", text: line.replace(/^#+[ \t]+/, "") });
    } else if (/^(?:[-*+]|\d+[.)])[ \t]/.test(line)) {
      flush();
      blocks.push({
        kind: "list",
        text: line.replace(/^(?:[-*+]|\d+[.)])[ \t]+/, ""),
      });
    } else if (line.startsWith("|")) {
      flush();
      blocks.push({ kind: "table", text: line });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}

const MARKS_ONLY = /^(?:\[\^\d+\]\s*)+/;

// A heuristic: it splits at a sentence end that is followed by a capital letter, and moves
// citation marks that follow the full stop back to the sentence they close.
export function sentencesOf(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?]["”’)]?)\s+(?=[A-Z"“([])/u)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const sentences: string[] = [];
  for (const part of parts) {
    const marks = MARKS_ONLY.exec(part)?.[0];
    if (marks && sentences.length > 0) {
      sentences[sentences.length - 1] += ` ${marks.trim()}`;
      const rest = part.slice(marks.length).trim();
      if (rest !== "") sentences.push(rest);
    } else sentences.push(part);
  }
  return sentences;
}

export function wordCount(markdown: string): number {
  const text = markdown
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(CITATION, " ");
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
