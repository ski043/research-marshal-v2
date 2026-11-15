import {
  AuthenticationError,
  DecodoClient,
  DecodoError,
  RateLimitError,
  Target,
  TimeoutError,
} from "@decodo/sdk-ts";
import { z } from "zod";
import {
  FatalRunError,
  type MapOutcome,
  type ReadOutcome,
  type WebActions,
} from "./budget";
import {
  PageUrl,
  type SearchOutcome,
  type SearchResult,
  type WebFailure,
} from "./events";

// The SDK types are loose and do not admit the failed-search shape, so nothing past this
// port trusts them.
export type DecodoPort = {
  googleSearch(query: string): Promise<unknown>;
  readMarkdown(url: string): Promise<unknown>;
  mapSite(url: string, limit: number): Promise<unknown>;
};

export function sdkPort(apiKey: string): DecodoPort {
  const api = new DecodoClient({
    webScrapingApi: { apiKey },
    timeoutMs: 150_000,
  }).webScrapingApi;
  return {
    googleSearch: (query) =>
      api.scrape({ target: Target.GoogleSearch, query, parse: true }),
    readMarkdown: (url) =>
      api.scrape({ target: Target.Universal, url, markdown: true }),
    mapSite: (url, limit) => api.map({ url, limit }),
  };
}

const GoogleSearchWire = z.object({
  results: z
    .array(
      z.object({
        content: z.object({
          results: z.object({
            results: z.object({
              organic: z
                .array(
                  z.object({
                    pos: z.number(),
                    title: z.string(),
                    url: z.string(),
                    desc: z.string().default(""),
                  }),
                )
                .default([]),
            }),
          }),
        }),
      }),
    )
    .min(1),
});

const FailedWire = z.object({
  status: z.literal("failed"),
  message: z.string(),
});

const ReadWire = z.object({
  results: z
    .array(z.object({ content: z.string(), status_code: z.int() }))
    .min(1),
});

const MapWire = z.object({
  results: z
    .array(
      z.object({
        content: z.object({ links: z.array(z.object({ url: z.string() })) }),
      }),
    )
    .min(1),
});

function badResponse(error: z.ZodError): WebFailure {
  return { kind: "bad-response", detail: z.prettifyError(error).slice(0, 300) };
}

function readablePageUrl(raw: string): PageUrl | null {
  const parsed = PageUrl.safeParse(raw);
  if (!parsed.success) return null;
  const url = new URL(parsed.data);
  const isGoogleRedirect =
    /(^|\.)google\.[a-z.]+$/.test(url.hostname) &&
    (url.pathname === "/goto" || url.pathname === "/url");
  return isGoogleRedirect ? null : parsed.data;
}

export function parseSearch(wire: unknown): SearchOutcome {
  const failed = FailedWire.safeParse(wire);
  if (failed.success) {
    return {
      status: "failed",
      failure: { kind: "rejected", detail: failed.data.message },
    };
  }
  const parsed = GoogleSearchWire.safeParse(wire);
  if (!parsed.success) {
    return { status: "failed", failure: badResponse(parsed.error) };
  }
  const organic = parsed.data.results[0]?.content.results.results.organic ?? [];
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const entry of organic) {
    const url = readablePageUrl(entry.url);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    results.push({
      position: results.length + 1,
      title: entry.title,
      url,
      snippet: entry.desc,
    });
  }
  if (organic.length > 0 && results.length === 0) {
    return {
      status: "failed",
      failure: { kind: "bad-response", detail: "no readable links" },
    };
  }
  return { status: "ok", results };
}

export function parseRead(wire: unknown): ReadOutcome {
  const parsed = ReadWire.safeParse(wire);
  if (!parsed.success) {
    return { status: "failed", failure: badResponse(parsed.error) };
  }
  const page = parsed.data.results[0];
  if (!page) {
    return {
      status: "failed",
      failure: { kind: "bad-response", detail: "no result" },
    };
  }
  if (page.status_code < 200 || page.status_code > 299) {
    return {
      status: "failed",
      failure: { kind: "http-status", detail: `status ${page.status_code}` },
    };
  }
  if (page.content.startsWith("%PDF-") || page.content.includes("\u0000")) {
    return {
      status: "failed",
      failure: { kind: "not-text", detail: "binary content such as a PDF" },
    };
  }
  if (page.content.trim() === "") {
    return {
      status: "failed",
      failure: { kind: "empty", detail: "no text on the page" },
    };
  }
  return { status: "ok", markdown: page.content };
}

export function parseMap(wire: unknown): MapOutcome {
  const parsed = MapWire.safeParse(wire);
  if (!parsed.success) {
    return { status: "failed", failure: badResponse(parsed.error) };
  }
  const links = parsed.data.results[0]?.content.links ?? [];
  const urls = new Set<PageUrl>();
  for (const link of links) {
    const url = readablePageUrl(link.url);
    if (url !== null) urls.add(url);
  }
  return { status: "ok", urls: [...urls] };
}

// Every error the run survives becomes a WebFailure (F1, F2). A rejected key ends the run.
export function failureOf(error: unknown): WebFailure {
  if (error instanceof AuthenticationError) {
    throw new FatalRunError(
      "decodo",
      `Decodo rejected the key: ${error.message}`,
    );
  }
  if (error instanceof TimeoutError) {
    return { kind: "timeout", detail: error.message };
  }
  if (error instanceof RateLimitError) {
    return { kind: "rate-limited", detail: error.message };
  }
  if (error instanceof DecodoError && /not supported/i.test(error.message)) {
    return { kind: "unsupported", detail: error.message };
  }
  return {
    kind: "rejected",
    detail: error instanceof Error ? error.message : String(error),
  };
}

export function createDecodoWeb(port: DecodoPort): WebActions {
  return {
    search: (query) =>
      port.googleSearch(query).then(parseSearch, (error: unknown) => ({
        status: "failed",
        failure: failureOf(error),
      })),
    read: (url) =>
      port.readMarkdown(url).then(parseRead, (error: unknown) => ({
        status: "failed",
        failure: failureOf(error),
      })),
    map: (site, limit) =>
      port.mapSite(site, limit).then(parseMap, (error: unknown) => ({
        status: "failed",
        failure: failureOf(error),
      })),
  };
}
