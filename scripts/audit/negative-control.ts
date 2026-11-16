import type { Check, Context } from "./checks";
import type { PageWords } from "./quote";

export type MutationKind = "changed" | "dropped" | "added";

export type Mutation = {
  number: number;
  url: string;
  kind: MutationKind;
  original: string;
  mutated: string;
  rejected: boolean;
};

const HAS_WORD = /[\p{L}\p{N}]/u;

function middleWordIndex(tokens: readonly string[]): number {
  const middle = Math.floor(tokens.length / 2);
  for (let d = 0; d < tokens.length; d += 1) {
    for (const i of [middle + d, middle - d]) {
      if (HAS_WORD.test(tokens[i] ?? "")) return i;
    }
  }
  return -1;
}

// A real word of the same page, so "changed" swaps in a plausible word, not a typo.
function commonPageWord(page: PageWords, not: string): string {
  const counts = new Map<string, number>();
  for (const w of page.words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  return ranked.find((w) => w !== not && /^\p{L}+$/u.test(w)) ?? "the";
}

export function mutate(
  quote: string,
  kind: MutationKind,
  replacement: string,
): string {
  const tokens = quote.split(/\s+/).filter((t) => t !== "");
  const i = middleWordIndex(tokens);
  const token = tokens[i] ?? "";
  if (kind === "dropped") tokens.splice(i, 1);
  else if (kind === "added") tokens.splice(i + 1, 0, "not");
  else {
    const digits = /\d+/.exec(token);
    tokens[i] = digits
      ? token.replace(digits[0], String(Number(digits[0]) + 1))
      : token.replace(/[\p{L}\p{N}]+/u, replacement);
  }
  return tokens.join(" ");
}

export function negativeControl(ctx: Context, sample = 5): Mutation[] {
  const byPage = new Map<string, { number: number; quote: string }[]>();
  for (const claim of ctx.verified.values()) {
    const page = ctx.pageWords(claim.url);
    if (!page?.find(claim.quote).found) continue;
    if (claim.quote.split(/\s+/).length < 6) continue;
    const list = byPage.get(claim.url) ?? [];
    list.push(claim);
    byPage.set(claim.url, list);
  }
  // One quote per page first, so the sample spans different page formats.
  const picked: { number: number; quote: string; url: string }[] = [];
  for (let depth = 0; picked.length < sample; depth += 1) {
    let added = false;
    for (const [url, list] of byPage) {
      const claim = list[depth];
      if (claim && picked.length < sample) {
        picked.push({ ...claim, url });
        added = true;
      }
    }
    if (!added) break;
  }
  return picked.flatMap(({ number, quote, url }) => {
    const page = ctx.pageWords(url) as PageWords;
    const original =
      quote.split(/\s+/)[middleWordIndex(quote.split(/\s+/))] ?? "";
    const replacement = commonPageWord(
      page,
      original.replace(/[^\p{L}\p{N}]/gu, ""),
    );
    return (["changed", "dropped", "added"] as const).map((kind) => {
      const mutated = mutate(quote, kind, replacement);
      return {
        number,
        url,
        kind,
        original: quote,
        mutated,
        rejected: !page.find(mutated).found,
      };
    });
  });
}

export function controlCheck(mutations: readonly Mutation[]): Check {
  const accepted = mutations.filter((m) => !m.rejected);
  const quotes = new Set(mutations.map((m) => m.number)).size;
  return {
    id: "v1.control",
    requirement: "V1",
    measures:
      "Negative control: one word changed, dropped or added in a few verified quotes. The independent check must reject every altered quote.",
    status:
      mutations.length === 0 ? "skip" : accepted.length > 0 ? "fail" : "pass",
    evidence: [
      mutations.length === 0
        ? "no verified quote of 6 or more words to alter"
        : `${mutations.length - accepted.length} of ${mutations.length} altered quotes rejected (${quotes} quotes x changed, dropped, added)`,
      ...accepted.map(
        (m) =>
          `accepted (${m.kind}) [^${m.number}]: "${m.mutated.slice(0, 120)}"`,
      ),
    ],
  };
}
