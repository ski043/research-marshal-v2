import { describe, expect, it, vi } from "vitest";
import { ENV_NAMES, readEnv } from "@/lib/env";

function stubAll(
  values: Record<(typeof ENV_NAMES)[number], string | undefined>,
) {
  for (const name of ENV_NAMES) {
    vi.stubEnv(name, values[name]);
  }
}

function errorOf(read: () => unknown): Error {
  try {
    read();
  } catch (thrown) {
    if (thrown instanceof Error) return thrown;
  }
  return expect.unreachable("readEnv must throw");
}

describe("readEnv", () => {
  it("returns every variable when all three are set", () => {
    stubAll({
      ANTHROPIC_API_KEY: "anthropic-key",
      DECODO_AUTH_TOKEN: "decodo-key",
      DATABASE_URL: "file:./test.db",
    });

    expect(readEnv(ENV_NAMES)).toEqual({
      ANTHROPIC_API_KEY: "anthropic-key",
      DECODO_AUTH_TOKEN: "decodo-key",
      DATABASE_URL: "file:./test.db",
    });
  });

  it("names the one missing variable and no other", () => {
    stubAll({
      ANTHROPIC_API_KEY: undefined,
      DECODO_AUTH_TOKEN: "decodo-key",
      DATABASE_URL: "file:./test.db",
    });

    const { message } = errorOf(() => readEnv(ENV_NAMES));
    expect(message).toContain("ANTHROPIC_API_KEY");
    expect(message).not.toContain("DECODO_AUTH_TOKEN");
    expect(message).not.toContain("DATABASE_URL");
  });

  it("treats an empty value as missing", () => {
    stubAll({
      ANTHROPIC_API_KEY: "anthropic-key",
      DECODO_AUTH_TOKEN: "",
      DATABASE_URL: "file:./test.db",
    });

    expect(() => readEnv(ENV_NAMES)).toThrow("DECODO_AUTH_TOKEN");
  });

  it("names the command that fixes a missing variable", () => {
    stubAll({
      ANTHROPIC_API_KEY: undefined,
      DECODO_AUTH_TOKEN: "decodo-key",
      DATABASE_URL: "file:./test.db",
    });

    expect(() => readEnv(ENV_NAMES)).toThrow("Run `pnpm bootstrap`");
  });

  it("names every missing variable at once", () => {
    stubAll({
      ANTHROPIC_API_KEY: undefined,
      DECODO_AUTH_TOKEN: "",
      DATABASE_URL: undefined,
    });

    const { message } = errorOf(() => readEnv(ENV_NAMES));
    for (const name of ENV_NAMES) expect(message).toContain(name);
  });

  it("reads only the variables it is asked for", () => {
    stubAll({
      ANTHROPIC_API_KEY: undefined,
      DECODO_AUTH_TOKEN: undefined,
      DATABASE_URL: "file:./test.db",
    });

    expect(readEnv(["DATABASE_URL"])).toEqual({
      DATABASE_URL: "file:./test.db",
    });
  });
});
