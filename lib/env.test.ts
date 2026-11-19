import { describe, expect, it, vi } from "vitest";
import { ENV_NAMES, readEnv, readFakesPace, requireStartEnv } from "@/lib/env";

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

describe("readFakesPace", () => {
  it("is null when RESEARCH_MARSHAL_FAKES is unset or empty", () => {
    vi.stubEnv("RESEARCH_MARSHAL_FAKES", undefined);
    expect(readFakesPace()).toBeNull();
    vi.stubEnv("RESEARCH_MARSHAL_FAKES", "");
    expect(readFakesPace()).toBeNull();
  });

  it("reads the pace in milliseconds", () => {
    vi.stubEnv("RESEARCH_MARSHAL_FAKES", "0");
    expect(readFakesPace()).toBe(0);
    vi.stubEnv("RESEARCH_MARSHAL_FAKES", "150");
    expect(readFakesPace()).toBe(150);
  });

  it.each(["yes", "-5", "1.5", " 10"])("rejects %j", (value) => {
    vi.stubEnv("RESEARCH_MARSHAL_FAKES", value);
    expect(() => readFakesPace()).toThrow("RESEARCH_MARSHAL_FAKES");
  });

  it("is not a required variable", () => {
    expect(ENV_NAMES).not.toContain("RESEARCH_MARSHAL_FAKES");
  });
});

describe("requireStartEnv", () => {
  const noKeys = {
    ANTHROPIC_API_KEY: undefined,
    DECODO_AUTH_TOKEN: undefined,
    DATABASE_URL: "file:./test.db",
  };

  it("needs both API keys for live runs", () => {
    stubAll(noKeys);
    vi.stubEnv("RESEARCH_MARSHAL_FAKES", undefined);

    const { message } = errorOf(() => requireStartEnv());

    expect(message).toContain("ANTHROPIC_API_KEY, DECODO_AUTH_TOKEN");
  });

  it("needs no API key on the fakes", () => {
    stubAll(noKeys);
    vi.stubEnv("RESEARCH_MARSHAL_FAKES", "0");

    expect(() => requireStartEnv()).not.toThrow();
  });

  it("needs the database on the fakes too", () => {
    stubAll({ ...noKeys, DATABASE_URL: undefined });
    vi.stubEnv("RESEARCH_MARSHAL_FAKES", "0");

    const { message } = errorOf(() => requireStartEnv());

    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain("ANTHROPIC_API_KEY");
  });
});
