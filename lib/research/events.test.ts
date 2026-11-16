import { describe, expect, it } from "vitest";
import { PageUrl, RoundNo, RunEvent, siteOf } from "./events";

describe("PageUrl", () => {
  it("drops the fragment, so one page has one identity", () => {
    expect(PageUrl.parse("https://en.wikipedia.org/wiki/Aurora#Causes")).toBe(
      "https://en.wikipedia.org/wiki/Aurora",
    );
  });

  it("rejects a URL that is not http or https", () => {
    expect(PageUrl.safeParse("ftp://example.org/file").success).toBe(false);
    expect(PageUrl.safeParse("javascript:alert(1)").success).toBe(false);
  });
});

it("siteOf returns the origin of a page", () => {
  expect(siteOf(PageUrl.parse("https://nextjs.org/docs/app?x=1"))).toBe(
    "https://nextjs.org",
  );
});

it("RoundNo admits only rounds 1 to 3", () => {
  expect([0, 1, 2, 3, 4].map((n) => RoundNo.safeParse(n).success)).toEqual([
    false,
    true,
    true,
    true,
    false,
  ]);
});

it("a stored selection keeps every number that the model made up", () => {
  const event = {
    type: "select.finished",
    round: 1,
    picked: ["https://example.org/a"],
    unknownNumbers: [1.5, -2, 99],
    mapRequest: null,
    seq: 3,
    at: "2026-11-15T21:00:00.000Z",
  };
  expect(RunEvent.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
});

it("a stored event parses back to the same event", () => {
  const event = {
    type: "page.failed",
    round: 2,
    url: "https://example.org/a",
    failure: { kind: "http-status", detail: "404" },
    seq: 7,
    at: "2026-11-15T21:00:00.000Z",
  };
  expect(RunEvent.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
});
