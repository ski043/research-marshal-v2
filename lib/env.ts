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
