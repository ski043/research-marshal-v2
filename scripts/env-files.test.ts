import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  durableEnvPath,
  mergeEnvLocal,
  resolveAppEnv,
} from "@/scripts/env-files.mjs";

const durable = { ANTHROPIC_API_KEY: "a-key", DECODO_AUTH_TOKEN: "d-key" };

describe("mergeEnvLocal", () => {
  it("creates every name when .env.local does not exist", () => {
    const result = mergeEnvLocal(null, durable);

    expect(parseEnv(result.text)).toEqual({
      ANTHROPIC_API_KEY: "a-key",
      DECODO_AUTH_TOKEN: "d-key",
      DATABASE_URL: "file:./dev.db",
    });
    expect(result.added).toEqual([
      "ANTHROPIC_API_KEY",
      "DECODO_AUTH_TOKEN",
      "DATABASE_URL",
    ]);
    expect(result.missing).toEqual([]);
  });

  it("never overwrites a value and adds only the names it lacks", () => {
    const existing =
      "# mine\nANTHROPIC_API_KEY=my-key\nDATABASE_URL=file:/tmp/x.db";

    const result = mergeEnvLocal(existing, durable);

    expect(result.text.startsWith(`${existing}\n`)).toBe(true);
    expect(parseEnv(result.text)).toEqual({
      ANTHROPIC_API_KEY: "my-key",
      DECODO_AUTH_TOKEN: "d-key",
      DATABASE_URL: "file:/tmp/x.db",
    });
    expect(result.added).toEqual(["DECODO_AUTH_TOKEN"]);
  });

  it("changes nothing when every name is present", () => {
    const first = mergeEnvLocal(null, durable);

    const second = mergeEnvLocal(first.text, durable);

    expect(second.text).toBe(first.text);
    expect(second.added).toEqual([]);
  });

  it("names the keys the durable file lacks and still adds DATABASE_URL", () => {
    const result = mergeEnvLocal(null, { ANTHROPIC_API_KEY: "a-key" });

    expect(result.missing).toEqual(["DECODO_AUTH_TOKEN"]);
    expect(parseEnv(result.text)).toEqual({
      ANTHROPIC_API_KEY: "a-key",
      DATABASE_URL: "file:./dev.db",
    });
  });

  it("treats a missing durable file like an empty one", () => {
    const result = mergeEnvLocal(null, null);

    expect(result.missing).toEqual(["ANTHROPIC_API_KEY", "DECODO_AUTH_TOKEN"]);
    expect(result.added).toEqual(["DATABASE_URL"]);
  });

  it("keeps an empty value and reports it", () => {
    const result = mergeEnvLocal("ANTHROPIC_API_KEY=\n", durable);

    expect(parseEnv(result.text).ANTHROPIC_API_KEY).toBe("");
    expect(result.empty).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it("leaves a name to .env when .env provides it", () => {
    const result = mergeEnvLocal(null, durable, {
      DATABASE_URL: "file:./history.db",
    });

    expect(result.added).toEqual(["ANTHROPIC_API_KEY", "DECODO_AUTH_TOKEN"]);
    expect(parseEnv(result.text).DATABASE_URL).toBeUndefined();
    expect(result.missing).toEqual([]);
  });

  it("quotes a value that a bare line would change", () => {
    const result = mergeEnvLocal(null, {
      ANTHROPIC_API_KEY: "a b#c",
      DECODO_AUTH_TOKEN: "it's",
    });

    expect(parseEnv(result.text)).toMatchObject({
      ANTHROPIC_API_KEY: "a b#c",
      DECODO_AUTH_TOKEN: "it's",
    });
  });
});

describe("resolveAppEnv", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "env-files-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("merges .env and .env.local, .env.local wins, the shell beats both", () => {
    writeFileSync(
      path.join(root, ".env"),
      "ANTHROPIC_API_KEY=from-env\nDATABASE_URL=file:./dev.db\n",
    );
    writeFileSync(
      path.join(root, ".env.local"),
      "ANTHROPIC_API_KEY=from-local\nDECODO_AUTH_TOKEN=from-local\n",
    );

    const resolved = resolveAppEnv(root, { DECODO_AUTH_TOKEN: "from-shell" });

    expect(resolved).toEqual({
      ANTHROPIC_API_KEY: { value: "from-local", source: ".env.local" },
      DECODO_AUTH_TOKEN: { value: "from-shell", source: "the shell" },
      DATABASE_URL: { value: "file:./dev.db", source: ".env" },
    });
  });

  it("returns null for a name no source sets", () => {
    expect(resolveAppEnv(root, {}).ANTHROPIC_API_KEY).toBeNull();
  });
});

describe("durableEnvPath", () => {
  it("uses RESEARCH_MARSHAL_ENV when it is set", () => {
    expect(durableEnvPath({ RESEARCH_MARSHAL_ENV: "/x/env" })).toBe("/x/env");
  });

  it("defaults to ~/.config/research-marshal/env", () => {
    expect(durableEnvPath({})).toMatch(/\.config\/research-marshal\/env$/);
  });
});
