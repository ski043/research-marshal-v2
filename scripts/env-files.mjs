// @ts-check
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

/** The variables `lib/env.ts` requires. */
export const APP_ENV_NAMES = [
  "ANTHROPIC_API_KEY",
  "DECODO_AUTH_TOKEN",
  "DATABASE_URL",
];

/** The variables the durable file holds. `DATABASE_URL` is per worktree. */
export const DURABLE_ENV_NAMES = ["ANTHROPIC_API_KEY", "DECODO_AUTH_TOKEN"];

export const DEFAULT_DATABASE_URL = "file:./dev.db";

/** Files in load order: the first file that sets a name wins, and the shell beats both. */
export const ENV_FILES = [".env.local", ".env"];

/**
 * @param {Record<string, string | undefined>} [shellEnv]
 * @returns {string}
 */
export function durableEnvPath(shellEnv = process.env) {
  return (
    shellEnv.RESEARCH_MARSHAL_ENV ||
    path.join(homedir(), ".config", "research-marshal", "env")
  );
}

/**
 * @param {string} file
 * @returns {Record<string, string | undefined> | null}
 */
export function readEnvFile(file) {
  if (!existsSync(file)) return null;
  return { ...parseEnv(readFileSync(file, "utf8")) };
}

/** @param {string} value */
function formatValue(value) {
  if (/^[\w.:/+=@-]*$/.test(value)) return value;
  if (!value.includes("'")) return `'${value}'`;
  return JSON.stringify(value);
}

/**
 * Adds to `.env.local` only the names it lacks. A name that is already in the
 * file keeps its value, even an empty one.
 *
 * @param {string | null} existingText the current `.env.local`, or null when it does not exist
 * @param {Record<string, string | undefined> | null} durable the durable file, or null when it does not exist
 * @returns {{ text: string, added: string[], missing: string[], empty: string[] }}
 *   `missing`: names neither file provides. `empty`: names `.env.local` holds with an empty value.
 */
export function mergeEnvLocal(existingText, durable) {
  const existing = parseEnv(existingText ?? "");
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const empty = [];
  const add = (/** @type {string} */ name, /** @type {string} */ value) => {
    lines.push(`${name}=${formatValue(value)}`);
    added.push(name);
  };

  for (const name of APP_ENV_NAMES) {
    if (name in existing) {
      if (existing[name] === "") empty.push(name);
      continue;
    }
    if (name === "DATABASE_URL") add(name, DEFAULT_DATABASE_URL);
    else if (durable?.[name]) add(name, durable[name]);
    else missing.push(name);
  }

  let text = existingText ?? "";
  if (lines.length > 0) {
    if (text !== "" && !text.endsWith("\n")) text += "\n";
    text += `${lines.join("\n")}\n`;
  }
  return { text, added, missing, empty };
}

/**
 * Resolves each app variable the way the app loads it: the shell first, then
 * `.env.local`, then `.env`.
 *
 * @param {string} root
 * @param {Record<string, string | undefined>} shellEnv
 * @returns {Record<string, { value: string, source: string } | null>}
 */
export function resolveAppEnv(root, shellEnv) {
  const files = ENV_FILES.map((name) => ({
    name,
    values: readEnvFile(path.join(root, name)) ?? {},
  }));
  /** @type {Record<string, { value: string, source: string } | null>} */
  const resolved = {};
  for (const name of APP_ENV_NAMES) {
    const shellValue = shellEnv[name];
    if (shellValue !== undefined) {
      resolved[name] = { value: shellValue, source: "the shell" };
      continue;
    }
    const file = files.find((f) => f.values[name] !== undefined);
    resolved[name] = file
      ? { value: file.values[name] ?? "", source: file.name }
      : null;
  }
  return resolved;
}

/**
 * @param {string} root
 * @param {string} databaseUrl
 * @returns {string | null} the SQLite path, or null when the URL is not a `file:` URL
 */
export function sqlitePath(root, databaseUrl) {
  if (!databaseUrl.startsWith("file:")) return null;
  return path.resolve(root, databaseUrl.slice("file:".length));
}
