import { existsSync } from "node:fs";
import path from "node:path";
import {
  type AnthropicLanguageModelOptions,
  createAnthropic,
} from "@ai-sdk/anthropic";
import { generateText, Output, streamText } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// loadEnvFile never overrides a set variable, so .env.local wins over .env and
// the shell wins over both, the same rule as `pnpm research` and Next.js.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
const { env } = await import("@/lib/env");
const { MODEL_CONFIG } = await import("@/lib/research/model-config");
const { createDecodoWeb, sdkPort } = await import("@/lib/research/decodo");
const { FatalRunError } = await import("@/lib/research/budget");
const { PageUrl, SiteUrl } = await import("@/lib/research/events");

const MODEL_ID = MODEL_CONFIG.select.model;
const providerOptions = {
  anthropic: {
    effort: MODEL_CONFIG.select.effort,
  } satisfies AnthropicLanguageModelOptions,
};

const requests: { url: string; signalAborted: boolean }[] = [];
const recordingFetch: typeof fetch = (input, init) => {
  requests.push({
    url: input instanceof Request ? input.url : String(input),
    signalAborted: init?.signal?.aborted ?? false,
  });
  return fetch(input, init);
};
const anthropic = createAnthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  fetch: recordingFetch,
});
const model = anthropic(MODEL_ID);

const web = createDecodoWeb(sdkPort(env.DECODO_AUTH_TOKEN));

describe("Anthropic through the AI SDK", () => {
  it("generateText reaches api.anthropic.com and returns text", async () => {
    const before = requests.length;
    const result = await generateText({
      model,
      providerOptions,
      maxRetries: 0,
      prompt: "Reply with the single word: ready",
    });

    const sent = requests.slice(before);
    expect(sent.length, "the recording fetch saw the request").toBeGreaterThan(
      0,
    );
    for (const { url } of sent) {
      expect(new URL(url).host, "every request went to Anthropic").toBe(
        "api.anthropic.com",
      );
    }
    expect(
      result.finalStep.response.modelId,
      "the response came from Claude Sonnet 5.5",
    ).toMatch(/^claude-sonnet-5-5/);
    expect(result.text.trim(), "the model returned text").not.toBe("");
  });

  it("Output.object parses the answer with the Zod schema", async () => {
    const schema = z.object({ product: z.number().int() });
    const result = await generateText({
      model,
      providerOptions,
      maxRetries: 0,
      output: Output.object({ schema }),
      prompt: "What is 17 multiplied by 3? Put the result in `product`.",
    });

    expect(
      schema.safeParse(result.output).success,
      "the output matches the schema",
    ).toBe(true);
    expect(result.output, "the model gave the one right answer").toEqual({
      product: 51,
    });
  });

  it("streamText delivers the text in more than one chunk", async () => {
    const result = streamText({
      model,
      providerOptions,
      maxRetries: 0,
      prompt: "Write three short sentences about the sea.",
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    expect(chunks.length, "more than one text chunk arrived").toBeGreaterThan(
      1,
    );
    expect(chunks.join("").trim(), "the joined text is non-empty").not.toBe("");
  });

  // The AI SDK still calls fetch when the signal is already aborted, so the check is on the signal that fetch receives.
  it("an aborted signal rejects the call and reaches fetch", async () => {
    const before = requests.length;

    await expect(
      generateText({
        model,
        providerOptions,
        maxRetries: 0,
        abortSignal: AbortSignal.abort(),
        prompt: "Reply with the single word: ready",
      }),
      "the call rejects",
    ).rejects.toThrow();
    const calls = requests.slice(before);
    expect(
      calls.every((call) => call.signalAborted),
      "every fetch call carried the already aborted signal",
    ).toBe(true);
  });
});

describe("Decodo through the research adapter", () => {
  it("a Google search returns organic results with page links", async () => {
    const outcome = await web.search("Prisma ORM SQLite");
    if (outcome.status === "failed") {
      throw new Error(`search failed: ${outcome.failure.detail}`);
    }
    expect(outcome.results.length, "the search found results").toBeGreaterThan(
      0,
    );
    for (const result of outcome.results) {
      expect(
        new URL(result.url).hostname,
        "no Google redirect link",
      ).not.toMatch(/(^|\.)google\./);
    }
  });

  it("a read of example.com returns its Markdown", async () => {
    const outcome = await web.read(PageUrl.parse("https://example.com"));
    expect(outcome, "the page is the Example Domain page").toEqual({
      status: "ok",
      markdown: expect.stringContaining(
        "This domain is for use in documentation examples",
      ),
    });
  });

  it("a map of nextjs.org lists pages of the site", async () => {
    const outcome = await web.map(SiteUrl.parse("https://nextjs.org"), 5);
    if (outcome.status === "failed") {
      throw new Error(`map failed: ${outcome.failure.detail}`);
    }
    expect(outcome.urls.length, "the map listed pages").toBeGreaterThan(0);
    expect(
      outcome.urls.length,
      "the map honored the limit",
    ).toBeLessThanOrEqual(5);
  });

  it("a rejected key is a fatal run error", async () => {
    const rejected = createDecodoWeb(sdkPort("invalid-api-key"));
    await expect(
      rejected.search("test"),
      "the adapter ends the run on a rejected key",
    ).rejects.toBeInstanceOf(FatalRunError);
  });
});

describe("SQLite through Prisma", () => {
  it("runs a raw query on the database file", async () => {
    const { db } = await import("@/lib/db");
    const rows = await db.$queryRaw<
      { version: string }[]
    >`SELECT sqlite_version() AS version`;

    expect(rows[0]?.version, "SQLite returned a version string").toMatch(
      /^\d+\.\d+\.\d+$/,
    );
    const file = path.resolve(env.DATABASE_URL.replace(/^file:/, ""));
    expect(existsSync(file), `the database file exists at ${file}`).toBe(true);
    await db.$disconnect();
  });
});
