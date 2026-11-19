export async function register() {
  const { requireStartEnv } = await import("@/lib/env");
  requireStartEnv();
}
