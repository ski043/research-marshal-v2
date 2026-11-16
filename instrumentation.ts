export async function register() {
  const { ENV_NAMES, readEnv } = await import("@/lib/env");
  readEnv(ENV_NAMES);
}
