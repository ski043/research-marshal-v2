import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  DECODO_AUTH_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
export type EnvName = keyof Env;

export const ENV_NAMES = Object.keys(envSchema.shape) as readonly EnvName[];

export function readEnv<const K extends EnvName>(
  names: readonly K[],
): Pick<Env, K> {
  const values = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  const missing = names.filter(
    (name) => !envSchema.shape[name].safeParse(values[name]).success,
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing or empty environment variables: ${missing.join(", ")}. ` +
        "Run `pnpm bootstrap` to create .env.local, then `pnpm doctor:worktree` to see what is still missing.",
    );
  }
  return values as Pick<Env, K>;
}

const FakesPace = z
  .string()
  .regex(/^\d+$/, "a whole number of milliseconds")
  .transform(Number);

/**
 * `RESEARCH_MARSHAL_FAKES`: the pace in milliseconds of the offline fakes, or null when it is
 * unset and runs are live. Optional, so it is not one of `ENV_NAMES`.
 */
export function readFakesPace(): number | null {
  const value = process.env.RESEARCH_MARSHAL_FAKES;
  if (value === undefined || value === "") return null;
  const parsed = FakesPace.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      "RESEARCH_MARSHAL_FAKES must be a whole number of milliseconds, for example 0 or 150.",
    );
  }
  return parsed.data;
}

/** Fails unless the app can start: the database always, both API keys unless runs are on the fakes. */
export function requireStartEnv(): void {
  readEnv(readFakesPace() === null ? ENV_NAMES : ["DATABASE_URL"]);
}
