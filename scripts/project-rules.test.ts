import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

type Diagnostic = { category: string; location: { path: string } };

// Each case is a file that the real biome.json lints in a scratch project.
// `rule` is the expected diagnostic category, or null when the file is allowed.
const LINT_CASES: { file: string; code: string; rule: string | null }[] = [
  ...[
    "react-hook-form",
    "@ai-sdk/gateway",
    "@ai-sdk/react",
    "@decodo/sdk",
    "react-markdown",
    "dotenv",
    "dotenv/config",
    "drizzle-orm",
    "drizzle-orm/sqlite-core",
    "eslint",
    "prettier",
    "bullmq",
    "workflow",
    "@tanstack/react-query",
    "swr",
    "next-auth",
    "@clerk/nextjs",
    "@streamdown/code",
    "@vercel/functions",
  ].map((pkg, i) => ({
    file: `lib/forbidden-${i}.ts`,
    code: `import x from "${pkg}";\nexport { x };\n`,
    rule: "lint/style/noRestrictedImports",
  })),
  {
    file: "lib/agent-loop.ts",
    code: 'import { ToolLoopAgent } from "ai";\nexport { ToolLoopAgent };\n',
    rule: "lint/style/noRestrictedImports",
  },
  {
    file: "lib/ai-gateway.ts",
    code: 'import { gateway } from "ai";\nexport { gateway };\n',
    rule: "lint/style/noRestrictedImports",
  },
  {
    file: "lib/ai-allowed.ts",
    code: 'import { generateText } from "ai";\nimport { DecodoClient } from "@decodo/sdk-ts";\nexport { generateText, DecodoClient };\n',
    rule: null,
  },
  {
    file: "lib/research/crawl-call.ts",
    code: "export const f = (api: { crawl(p: object): void }) => api.crawl({});\n",
    rule: "plugin",
  },
  {
    file: "lib/research/crawl-start.ts",
    code: "export const f = (api: { startCrawl(p: object): void }) => api.startCrawl({});\n",
    rule: "plugin",
  },
  {
    file: "lib/research/crawl-destructure.ts",
    code: "export const f = (api: { getCrawlResults(): void }) => {\n  const { getCrawlResults } = api;\n  return getCrawlResults;\n};\n",
    rule: "plugin",
  },
  {
    file: "lib/research/scrape.ts",
    code: "export const f = (api: { scrape(p: object): void }) => api.scrape({});\n",
    rule: null,
  },
  {
    file: "lib/research/pipeline.ts",
    code: 'export const model = "claude-opus-5-5";\n',
    rule: "plugin",
  },
  {
    file: "app/page.tsx",
    code: "export const model = `claude-haiku-5-5`;\n",
    rule: "plugin",
  },
  {
    file: "lib/research/model-config.ts",
    code: 'export const model = "claude-sonnet-5-5";\n',
    rule: null,
  },
  {
    file: "verify/stack.verify.ts",
    code: "export const model = /^claude-sonnet-5-5/;\n",
    rule: null,
  },
  {
    file: "lib/research/env-read.ts",
    code: "export const key = process.env.ANTHROPIC_API_KEY;\n",
    rule: "lint/style/noProcessEnv",
  },
  {
    file: "lib/research/env-destructure.ts",
    code: "const { env } = process;\nexport const key = env.ANTHROPIC_API_KEY;\n",
    rule: "plugin",
  },
  {
    file: "lib/research/env-import.ts",
    code: 'import { env } from "node:process";\nexport const key = env.ANTHROPIC_API_KEY;\n',
    rule: "lint/style/noRestrictedImports",
  },
  {
    file: "lib/env.ts",
    code: "export const key = process.env.ANTHROPIC_API_KEY;\n",
    rule: null,
  },
  {
    file: "prisma7.config.ts",
    code: "export const url = process.env.DATABASE_URL;\n",
    rule: null,
  },
  {
    file: "scripts/tool.mjs",
    code: "export const home = process.env.HOME;\n",
    rule: null,
  },
  {
    file: "app/api/runs/route.ts",
    code: 'export const runtime = "edge";\n',
    rule: "plugin",
  },
  {
    file: "app/api/other/route.ts",
    code: 'export const runtime = "nodejs";\n',
    rule: null,
  },
];

describe("lint rules fire on a violation", () => {
  let scratch: string;
  let diagnostics: Diagnostic[];

  beforeAll(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "rm-rules-"));
    cpSync(path.join(root, "biome.json"), path.join(scratch, "biome.json"));
    cpSync(
      path.join(root, "scripts/lint"),
      path.join(scratch, "scripts/lint"),
      {
        recursive: true,
      },
    );
    for (const c of LINT_CASES) {
      mkdirSync(path.dirname(path.join(scratch, c.file)), { recursive: true });
      writeFileSync(path.join(scratch, c.file), c.code);
    }
    // The scratch project is outside the git root, so VCS ignore files are off.
    const run = spawnSync(
      path.join(root, "node_modules/.bin/biome"),
      [
        "lint",
        "--vcs-enabled=false",
        "--reporter=json",
        "--max-diagnostics=none",
        ".",
      ],
      { cwd: scratch, encoding: "utf8" },
    );
    diagnostics = JSON.parse(run.stdout).diagnostics;
  });

  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  test.each(LINT_CASES)("$file -> $rule", (c) => {
    const categories = diagnostics
      .filter((d) => d.location.path === c.file)
      .map((d) => d.category);
    if (c.rule === null) expect(categories).toEqual([]);
    else expect(categories).toContain(c.rule);
  });
});

const packageJson = JSON.parse(read("package.json"));
const dependencies: Record<string, string> = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};
const stackDoc = read("TECH_STACK.md");
const allowedPart = stackDoc.slice(0, stackDoc.indexOf("## Not in the stack"));

// Each dependency maps to the words in TECH_STACK.md that name it.
const STACK_NAMES: Record<string, string> = {
  "@ai-sdk/anthropic": "`@ai-sdk/anthropic`",
  "@biomejs/biome": "| Biome |",
  "@decodo/sdk-ts": "`@decodo/sdk-ts`",
  "@prisma/adapter-better-sqlite3": "`@prisma/adapter-better-sqlite3`",
  "@prisma/client": "`@prisma/client`",
  "@types/better-sqlite3": "`@types/better-sqlite3`",
  "@types/node": "| Node.js |",
  "@types/react": "| React |",
  "@types/react-dom": "| React |",
  ai: "AI SDK (`ai`)",
  "lucide-react": "| lucide-react |",
  next: "| Next.js with the App Router |",
  prisma: "`prisma`",
  react: "| React |",
  "react-dom": "| React |",
  shadcn: "shadcn/ui",
  streamdown: "| Streamdown |",
  tailwindcss: "| Tailwind CSS |",
  typescript: "| TypeScript, strict mode |",
  vitest: "| Vitest |",
  zod: "| Zod |",
};

// These were in package.json before this rule existed, and TECH_STACK.md does
// not name them yet. The owner decides whether the stack lists them (audit G5).
// Do not add to this list: ask the user, then add the package to TECH_STACK.md.
const NOT_YET_IN_STACK = new Set([
  "@base-ui/react",
  "@tailwindcss/turbopack",
  "class-variance-authority",
  "cn",
  "tw-animate-css",
]);

describe("package.json follows TECH_STACK.md", () => {
  test.each(Object.keys(dependencies))("%s is named by the stack", (name) => {
    if (NOT_YET_IN_STACK.has(name)) return;
    const words = STACK_NAMES[name];
    expect(
      words,
      `${name} is not in TECH_STACK.md. Ask the user before you add a dependency.`,
    ).toBeDefined();
    expect(allowedPart).toContain(words);
  });

  test("no dependency is one that biome.json forbids", () => {
    const options = JSON.parse(read("biome.json")).linter.rules.style
      .noRestrictedImports.options;
    const forbidden = Object.entries(options.paths)
      .filter(([, v]) => typeof v === "string")
      .map(([k]) => k);
    const scopes = (options.patterns as { group: string[] }[])
      .flatMap((p) => p.group)
      .map((g) => g.replace(/\/\*$/, "/"));
    for (const name of Object.keys(dependencies)) {
      expect(forbidden, name).not.toContain(name);
      for (const scope of scopes)
        expect(name.startsWith(scope), name).toBe(false);
    }
  });

  test("better-sqlite3 comes only through the Prisma adapter", () => {
    expect(dependencies["better-sqlite3"]).toBeUndefined();
  });

  test("the Prisma packages are pinned to 7.10.1", () => {
    for (const name of [
      "prisma",
      "@prisma/client",
      "@prisma/adapter-better-sqlite3",
    ]) {
      expect(dependencies[name], name).toBe("7.10.1");
    }
  });
});

describe("git keeps secrets and data out", () => {
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: root, encoding: "utf8" });

  test("no env file or database is tracked", () => {
    const tracked = git("ls-files").stdout.split("\n");
    const bad = tracked.filter(
      (f) =>
        (/(^|\/)\.env/.test(f) && f !== ".env.example") ||
        /\.(db|sqlite3?)(-journal|-wal|-shm)?$/.test(f),
    );
    expect(bad).toEqual([]);
  });

  test.each([
    ".env",
    ".env.local",
    "dev.db",
    "dev.db-journal",
    ".claude/settings.local.json",
  ])("git ignores %s", (file) => {
    expect(git("check-ignore", "-q", "--no-index", file).status).toBe(0);
  });
});
