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
      if (!ALLOWED_TAGS.has(name.toLowerCase())) {
        problems.push(`${mode}: element ${tag}`);
      }
      if (/\s(?:src|srcset|style|on[a-z]+)=/i.test(attributes)) {
        problems.push(`${mode}: attribute in ${tag}`);
      }
    }
    if (/javascript:/i.test(html)) problems.push(`${mode}: javascript: URL`);
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
