const MARK = /(\\*)\[\^(\d+)\]/g;
const HREF = /^#cite-(\d+)$/;

/**
 * Turns each citation mark `[^n]` of a report into a Markdown link `[n](#cite-n)`, which
 * the report renders as a citation chip. A mark of a claim that is not in `known` and a
 * mark that the report escaped stay as they are, so they read as plain text.
 */
export function linkCitations(
  markdown: string,
  known: ReadonlySet<number>,
): string {
  return markdown.replace(MARK, (match, slashes: string, digits: string) => {
    // An odd run of backslashes escapes the bracket: the report means the text itself.
    if (slashes.length % 2 === 1) return match;
    const number = Number(digits);
    return known.has(number) ? `${slashes}[${number}](#cite-${number})` : match;
  });
}

/** The claim number of a link that `linkCitations` wrote, or null for any other link. */
export function citationOf(href: string | undefined): number | null {
  const match = HREF.exec(href ?? "");
  return match ? Number(match[1]) : null;
}
