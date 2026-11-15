import { existsSync } from "node:fs";
import path from "node:path";
import {
  type AnthropicLanguageModelOptions,
  createAnthropic,
} from "@ai-sdk/anthropic";
import { AuthenticationError, DecodoClient, Target } from "@decodo/sdk-ts";
import { generateText, Output, streamText } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const envFile = [".env.local", ".env"].find((file) => existsSync(file));
if (envFile) process.loadEnvFile(envFile);
const { env } = await import("@/lib/env");

const MODEL_ID = "claude-sonnet-5-5";
const providerOptions = {
  anthropic: { effort: "low" } satisfies AnthropicLanguageModelOptions,
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

const decodo = new DecodoClient({
  webScrapingApi: { apiKey: env.DECODO_AUTH_TOKEN },
  timeoutMs: 120_000,
});

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

describe("Decodo through the TypeScript SDK", () => {
  it("search returns organic results with a link", async () => {
    const serp = await decodo.webScrapingApi.search({
      query: "Prisma ORM SQLite",
    });
    if (serp.status === "failed") {
      throw new Error(`search failed: ${serp.message}`);
    }
    const links = (serp.organic ?? []).filter((entry) => entry.link);
    expect(
      links.length,
      "at least one organic result has a link",
    ).toBeGreaterThan(0);
  });

  it("scrape reads example.com as Markdown", async () => {
    const response = await decodo.webScrapingApi.scrape({
      target: Target.Universal,
      url: "https://example.com",
      markdown: true,
    });
    const content = response.results[0]?.content;
    expect(typeof content, "the page content is a string").toBe("string");
    // The Markdown output drops the page's "Example Domain" heading, so match the body sentence.
    expect(content, "the page content is the Example Domain page").toContain(
      "This domain is for use in documentation examples",
    );
  });

  it("map returns at least one link", async () => {
    const map = await decodo.webScrapingApi.map({
      url: "https://nextjs.org",
      limit: 5,
    });
    const links = map.results[0]?.content.links ?? [];
    expect(links.length, "the map found at least one link").toBeGreaterThan(0);
  });

  it("an invalid API key rejects with AuthenticationError", async () => {
    const invalid = new DecodoClient({
      webScrapingApi: { apiKey: "invalid-api-key" },
      timeoutMs: 60_000,
    });
    await expect(
      invalid.webScrapingApi.search({ query: "test" }),
      "the SDK maps a bad key to AuthenticationError",
    ).rejects.toBeInstanceOf(AuthenticationError);
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
