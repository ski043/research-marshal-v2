import { beforeEach, describe, expect, it, vi } from "vitest";

const NAMES = [
  "ANTHROPIC_API_KEY",
  "DECODO_AUTH_TOKEN",
  "DATABASE_URL",
] as const;

function stubAll(values: Record<(typeof NAMES)[number], string | undefined>) {
  for (const name of NAMES) {
    vi.stubEnv(name, values[name]);
  }
}

async function importEnv() {
  const module = await import("@/lib/env");
  return module.env;
}

beforeEach(() => {
  vi.resetModules();
});

describe("lib/env", () => {
  it("exports every variable when all three are set", async () => {
    stubAll({
      ANTHROPIC_API_KEY: "anthropic-key",
      DECODO_AUTH_TOKEN: "decodo-key",
      DATABASE_URL: "file:./test.db",
    });

    await expect(importEnv()).resolves.toEqual({
      ANTHROPIC_API_KEY: "anthropic-key",
      DECODO_AUTH_TOKEN: "decodo-key",
      DATABASE_URL: "file:./test.db",
    });
  });

  it("names the one missing variable and no other", async () => {
    stubAll({
      ANTHROPIC_API_KEY: undefined,
      DECODO_AUTH_TOKEN: "decodo-key",
      DATABASE_URL: "file:./test.db",
    });

    const error = await importEnv().then(
      () => expect.unreachable("import must throw"),
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("ANTHROPIC_API_KEY");
    expect(message).not.toContain("DECODO_AUTH_TOKEN");
    expect(message).not.toContain("DATABASE_URL");
  });

  it("treats an empty value as missing", async () => {
    stubAll({
      ANTHROPIC_API_KEY: "anthropic-key",
      DECODO_AUTH_TOKEN: "",
      DATABASE_URL: "file:./test.db",
    });

    await expect(importEnv()).rejects.toThrow("DECODO_AUTH_TOKEN");
  });

  it("names every missing variable at once", async () => {
    stubAll({
      ANTHROPIC_API_KEY: undefined,
      DECODO_AUTH_TOKEN: "",
      DATABASE_URL: undefined,
    });

    const error = await importEnv().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Error);
    for (const name of NAMES) {
      expect((error as Error).message).toContain(name);
    }
  });
});
