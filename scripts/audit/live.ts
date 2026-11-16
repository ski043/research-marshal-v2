import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Check, Context } from "./checks";
import { PageWords } from "./quote";

const run = promisify(execFile);

// The CLI's `universal --markdown` is the same request as the app's SDK read
// (audit D, section 7), and it does not go through lib/research/decodo.ts.
export type Fetched =
  | { ok: true; markdown: string; statusCode: number; ms: number }
  | { ok: false; error: string; ms: number };

export type Fetcher = (url: string, file: string) => Promise<Fetched>;

export const decodoCli: Fetcher = async (url, file) => {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  try {
    await run(
      "decodo",
      ["universal", url, "--markdown", "--full", "-o", file],
      { timeout: 150_000, env: process.env },
    );
    const envelope = JSON.parse(readFileSync(file, "utf8")) as {
      results?: { content?: unknown; status_code?: unknown }[];
    };
    const first = envelope.results?.[0];
    const statusCode = Number(first?.status_code ?? 0);
    if (typeof first?.content !== "string") {
      return { ok: false, error: "the response has no text content", ms: ms() };
    }
    if (statusCode >= 400) {
      return { ok: false, error: `HTTP ${statusCode}`, ms: ms() };
    }
    return { ok: true, markdown: first.content, statusCode, ms: ms() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message.split("\n")[0] ?? message, ms: ms() };
  }
};

export type LiveOutcome =
  | "same-text"
  | "quotes-found"
  | "page-changed"
  | "refetch-failed"
  | "quote-missing";

export type LiveSource = {
  url: string;
  outcome: LiveOutcome;
  quotes: number;
  found: number;
  ms: number;
  detail: string;
};

export function citedPages(
  ctx: Context,
): Map<string, { number: number; quote: string }[]> {
  const cited = new Set(ctx.parsed?.bodyCitations ?? []);
  const byUrl = new Map<string, { number: number; quote: string }[]>();
  for (const claim of ctx.verified.values()) {
    if (!cited.has(claim.number)) continue;
    const list = byUrl.get(claim.url) ?? [];
    list.push(claim);
    byUrl.set(claim.url, list);
  }
  return byUrl;
}

export async function liveCheck(
  ctx: Context,
  dir: string,
  fetcher: Fetcher = decodoCli,
): Promise<{ check: Check; sources: LiveSource[] }> {
  mkdirSync(dir, { recursive: true });
  const pages = [...citedPages(ctx)];
  const sources: LiveSource[] = [];
  // Four at a time: fast enough, and gentle on the rate limit.
  for (let i = 0; i < pages.length; i += 4) {
    const batch = pages.slice(i, i + 4).map(async ([url, claims]) => {
      const file = path.join(
        dir,
        `${createHash("sha1").update(url).digest("hex").slice(0, 12)}.json`,
      );
      const fresh = await fetcher(url, file);
      const base = { url, quotes: claims.length, ms: fresh.ms };
      if (!fresh.ok) {
        return {
          ...base,
          outcome: "refetch-failed",
          found: 0,
          detail: fresh.error,
        } as const;
      }
      const page = new PageWords(fresh.markdown);
      const found = claims.filter((c) => page.find(c.quote).found).length;
      const stored = ctx.stored.pages.get(url);
      const same = stored === fresh.markdown;
      const sizes = `stored ${stored?.length ?? 0} chars, fresh ${fresh.markdown.length}`;
      if (found === claims.length) {
        return {
          ...base,
          outcome: same ? "same-text" : "quotes-found",
          found,
          detail: sizes,
        } as const;
      }
      return {
        ...base,
        outcome: same ? "quote-missing" : "page-changed",
        found,
        detail: `${sizes}; missing ${claims
          .filter((c) => !page.find(c.quote).found)
          .map((c) => `[^${c.number}]`)
          .join("")}`,
      } as const;
    });
    sources.push(...(await Promise.all(batch)));
  }
  const count = (o: LiveOutcome) =>
    sources.filter((s) => s.outcome === o).length;
  const status =
    count("quote-missing") > 0
      ? "fail"
      : count("page-changed") + count("refetch-failed") > 0
        ? "warn"
        : sources.length === 0
          ? "skip"
          : "pass";
  const quotes = sources.reduce((n, s) => n + s.quotes, 0);
  const found = sources.reduce((n, s) => n + s.found, 0);
  return {
    sources,
    check: {
      id: "v1.live",
      requirement: "V1, W1",
      measures:
        "Paid: each cited page re-fetched through Decodo now; its cited quotes checked on the fresh text. A changed or unreadable page is its own outcome, not a failed quote.",
      status,
      evidence: [
        `${found} of ${quotes} cited quotes found on ${sources.length} fresh pages: same text ${count("same-text")}, text differs but quotes found ${count("quotes-found")}, page changed ${count("page-changed")}, re-fetch failed ${count("refetch-failed")}, quote missing ${count("quote-missing")}`,
        ...sources.map(
          (s) =>
            `${s.outcome}: ${s.found}/${s.quotes} quotes, ${(s.ms / 1000).toFixed(1)} s, ${s.url} (${s.detail})`,
        ),
      ],
    },
  };
}
