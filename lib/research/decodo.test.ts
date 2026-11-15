import { readFileSync } from "node:fs";
import {
  AuthenticationError,
  DecodoError,
  RateLimitError,
  TimeoutError,
} from "@decodo/sdk-ts";
import { describe, expect, it } from "vitest";
import { FatalRunError } from "./budget";
import { createDecodoWeb, type DecodoPort } from "./decodo";
import { PageUrl, SiteUrl } from "./events";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  );
}

function webAnswering(answer: () => Promise<unknown>) {
  const port: DecodoPort = {
    googleSearch: answer,
    readMarkdown: answer,
    mapSite: answer,
  };
  return createDecodoWeb(port);
}

const page = PageUrl.parse("https://example.com/");
const site = SiteUrl.parse("https://nextjs.org");

describe("search", () => {
  it("turns a parsed Google search into numbered results with real links", async () => {
    const web = webAnswering(async () => fixture("google-search.ok.json"));
    const outcome = await web.search("what causes aurora borealis");
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.results).toHaveLength(4);
    expect(outcome.results[1]).toEqual({
      position: 2,
      title: "Aurora",
      url: "https://en.wikipedia.org/wiki/Aurora",
      snippet:
        "Auroras are the result of disturbances in the Earth's magnetosphere caused by enhanced speeds of solar wind from coronal holes and coronal mass ejections.",
    });
  });

  it("treats a search without organic results as ok with no results (F2)", async () => {
    const web = webAnswering(async () => fixture("google-search.empty.json"));
    expect(await web.search("nonsense")).toEqual({ status: "ok", results: [] });
  });

  it("treats the status-failed shape as a failed search", async () => {
    const web = webAnswering(async () => fixture("google-search.failed.json"));
    expect(await web.search("x")).toEqual({
      status: "failed",
      failure: {
        kind: "rejected",
        detail: "We were not able to scrape the target. You can try",
      },
    });
  });

  it("leaves out Google redirect links, and fails when no readable link is left", async () => {
    const wire = fixture("google-search.ok.json");
    const redirected = JSON.parse(
      JSON.stringify(wire).replace(
        /"url":"https:\/\/(?!www\.google\.com\/search)[^"]+"/g,
        '"url":"https://www.google.com/goto?url=x"',
      ),
    );
    const web = webAnswering(async () => redirected);
    expect(await web.search("x")).toEqual({
      status: "failed",
      failure: { kind: "bad-response", detail: "no readable links" },
    });
  });

  it("keeps the readable results when another result is incomplete", async () => {
    const web = webAnswering(async () => ({
      results: [
        {
          content: {
            results: {
              results: {
                organic: [
                  { title: "No link" },
                  { url: "https://example.org/official", desc: "The page." },
                  { pos: 3, title: 7, url: "https://example.org/odd" },
                ],
              },
            },
          },
        },
      ],
    }));
    expect(await web.search("x")).toEqual({
      status: "ok",
      results: [
        {
          position: 1,
          title: "",
          url: "https://example.org/official",
          snippet: "The page.",
        },
      ],
    });
  });

  it("drops Google's click id, so one page found twice is one result", async () => {
    const organic = (srsltid: string) => ({
      pos: 1,
      title: "LiFePO4 cycle life",
      url: `https://example.org/cycle-life?page=2&srsltid=${srsltid}`,
      desc: "",
    });
    const web = webAnswering(async () => ({
      results: [
        {
          content: {
            results: { results: { organic: [organic("AAA"), organic("BBB")] } },
          },
        },
      ],
    }));
    expect(await web.search("x")).toMatchObject({
      status: "ok",
      results: [{ position: 1, url: "https://example.org/cycle-life?page=2" }],
    });
  });
});

describe("read", () => {
  it("returns the Markdown of a page", async () => {
    const web = webAnswering(async () => fixture("read.ok.json"));
    const outcome = await web.read(page);
    expect(outcome).toEqual({
      status: "ok",
      markdown: expect.stringContaining(
        "This domain is for use in documentation examples",
      ),
    });
  });

  it("fails a page that answered 404", async () => {
    const web = webAnswering(async () => fixture("read.404.json"));
    expect(await web.read(page)).toEqual({
      status: "failed",
      failure: { kind: "http-status", detail: "status 404" },
    });
  });

  it("fails a page whose content is PDF bytes", async () => {
    const web = webAnswering(async () => fixture("read.pdf.json"));
    expect(await web.read(page)).toMatchObject({
      status: "failed",
      failure: { kind: "not-text" },
    });
  });

  it("fails a page that Decodo could not scrape, with Decodo's message", async () => {
    const web = webAnswering(async () => fixture("read.failed.json"));
    expect(await web.read(page)).toEqual({
      status: "failed",
      failure: {
        kind: "rejected",
        detail: expect.stringContaining(
          "We were not able to scrape the target",
        ),
      },
    });
  });

  it("fails a response that does not match the wire schema", async () => {
    const web = webAnswering(async () => ({ results: [] }));
    expect(await web.read(page)).toMatchObject({
      status: "failed",
      failure: { kind: "bad-response" },
    });
  });
});

describe("map", () => {
  it("returns the listed URLs of a site", async () => {
    const web = webAnswering(async () => fixture("map.ok.json"));
    expect(await web.map(site, 5)).toEqual({
      status: "ok",
      urls: [
        "https://nextjs.org/",
        "https://nextjs.org/docs",
        "https://nextjs.org/learn",
        "https://nextjs.org/showcase",
        "https://nextjs.org/blog",
      ],
    });
  });
});

describe("errors", () => {
  it.each([
    [new DecodoError("Url is not supported.", 400, "error"), "unsupported"],
    [new DecodoError("Request processing failed", 400, "error"), "rejected"],
    [new TimeoutError("timed out"), "timeout"],
    [new RateLimitError("slow down"), "rate-limited"],
  ])("maps %s to a %s failure that the run survives", async (error, kind) => {
    const web = webAnswering(() => Promise.reject(error));
    expect(await web.map(site, 5)).toMatchObject({
      status: "failed",
      failure: { kind },
    });
    expect(await web.read(page)).toMatchObject({ failure: { kind } });
    expect(await web.search("x")).toMatchObject({ failure: { kind } });
  });

  it("turns a rejected key into a fatal run error", async () => {
    const web = webAnswering(() => Promise.reject(new AuthenticationError()));
    await expect(web.search("x")).rejects.toBeInstanceOf(FatalRunError);
    await expect(web.read(page)).rejects.toBeInstanceOf(FatalRunError);
  });
});
