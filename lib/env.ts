import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  DECODO_AUTH_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    DECODO_AUTH_TOKEN: process.env.DECODO_AUTH_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
  });
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(
      `Missing or empty environment variables: ${missing.join(", ")}`,
    );
  }
  return result.data;
}

export const env = parseEnv();
