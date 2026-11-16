// @ts-check
// The Claude Code SessionStart hook (.claude/settings.json). It runs the
// doctor without pnpm, runs the bootstrap when the worktree is not ready, and
// prints one short status for the agent. Its stdout becomes agent context, so
// it prints only check labels, details and fixes, which never hold a value.
// It always exits 0, because a failed hook must not stop the session.
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const BOOTSTRAP_TIMEOUT_MS = 280_000;

/** @param {string} text */
function say(text) {
  console.log(`Research Marshal worktree: ${text}`);
}

try {
  const { failedLabels, realContext, runChecks } = await import("./doctor.mjs");
  const before = await runChecks(realContext(root));
  if (before.ready) {
    say("READY. Run `pnpm check` before each commit.");
  } else {
    const missing = failedLabels(before.results).join(", ");
    const bootstrap = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "setup-worktree.mjs")],
      { cwd: root, stdio: "ignore", timeout: BOOTSTRAP_TIMEOUT_MS },
    );
    const after = await runChecks(realContext(root));
    if (after.ready) {
      say(
        `was not ready (${missing}). The session start hook ran \`pnpm bootstrap\`. READY now. Run \`pnpm check\` before each commit.`,
      );
    } else {
      const timedOut = bootstrap.error ? " (the bootstrap timed out)" : "";
      say(
        `NOT READY after the session start hook ran \`pnpm bootstrap\`${timedOut}. Missing: ${failedLabels(after.results).join(", ")}.`,
      );
      for (const r of after.results.filter((r) => r.status === "fail")) {
        console.log(`- ${r.label}: ${r.detail}. Fix: ${r.fix}`);
      }
      const keyIds = ["env-anthropic-api-key", "env-decodo-auth-token"];
      if (
        after.results.some((r) => r.status === "fail" && keyIds.includes(r.id))
      ) {
        console.log(
          "Ask the user to add each missing key to the durable env file. Do not ask for a key in the chat.",
        );
      }
    }
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  say(
    `the session start check failed (${reason}). Run \`pnpm doctor:worktree\`.`,
  );
}
process.exit(0);
