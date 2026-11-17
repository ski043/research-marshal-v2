import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  TOKENS_COMMAND,
  TOKENS_FILE,
  tokensMarkdown,
} from "@/lib/ui/design-system-markdown";
import { loadDesignSystem } from "@/lib/ui/design-system-source";

const USAGE = `Usage: ${TOKENS_COMMAND} [--check]

Writes ${TOKENS_FILE} from app/globals.css and the roles in
lib/ui/design-system.ts.

  --check  Write nothing. Exit 1 when the file differs from what would be written.`;

const { values } = parseArgs({
  options: {
    check: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, TOKENS_FILE);
const fresh = tokensMarkdown(loadDesignSystem(root));

if (values.check) {
  let committed = "";
  try {
    committed = readFileSync(file, "utf8");
  } catch {
    // No file yet counts as stale.
  }
  if (committed !== fresh) {
    console.error(`STALE: ${TOKENS_FILE}. Run ${TOKENS_COMMAND}.`);
    process.exit(1);
  }
  console.log(`FRESH: ${TOKENS_FILE}`);
} else {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, fresh);
  console.log(`Wrote ${TOKENS_FILE}`);
}
