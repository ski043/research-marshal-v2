# Research Marshal

Research Marshal answers one research question with a cited Markdown report. Every fact in the report carries a quote that the app verified on a real web page.

## Source of truth

[PRD.md](PRD.md) defines what the product does. Read it before you plan or write code.

- If you have a question about behavior, scope, or terms, look in the PRD first.
- If the PRD does not answer the question, ask the user. Do not guess.
- If a task conflicts with the PRD, stop and ask the user.
- The PRD lists open questions. Do not decide them yourself.
- Use the terms from the Terms table of the PRD. Refer to requirements by their ID, for example V1 or B3.
- Change the PRD only when the user asks you to.

## Tech stack

[TECH_STACK.md](TECH_STACK.md) defines the technologies that the project uses. Read it before you add a dependency or write code.

- Use the technologies and the versions that the tech stack lists.
- The tech stack has a table of technologies that the project does not use. Do not add one of them.
- If you need a dependency that the tech stack does not list, ask the user. Do not add it yourself.
- Change the tech stack only when the user asks you to.

## Setup

- In a fresh worktree, run `pnpm bootstrap` before anything else. It creates `.env.local`, installs the dependencies, generates the Prisma client, and migrates the database. It ends with `READY` or `NOT READY`.
- When something looks wrong, run `pnpm doctor:worktree`. Each failed check prints the command that fixes it.
- The API keys come from `~/.config/research-marshal/env`. If bootstrap says a key is missing, ask the user to add it to that file. Do not ask for the key in the chat.
- Never print, copy, or commit the contents of `.env.local`, `.env`, or the durable env file. Refer to variables by name only.
- In Claude Code, a SessionStart hook (`scripts/session-start.mjs`) runs the doctor checks at the start of each session. It needs no `node_modules`. When the worktree is not ready, the hook runs the bootstrap and tells you what is still missing. The project settings in `.claude/settings.json` deny reads of the env files.

## Commands

| Command | What it proves | Paid requests |
| --- | --- | --- |
| `pnpm check` | Lint, the types, and the unit tests pass. CI runs it on every pull request. | No |
| `pnpm bootstrap` | The worktree is set up and ready. | No |
| `pnpm doctor:worktree` | The worktree is ready. It changes no file. | No |
| `pnpm doctor:worktree --live` | Both API keys work. | Yes: one Decodo scrape |
| `pnpm lint` | Lint and formatting pass. | No |
| `pnpm test` | The unit tests pass. | No |
| `pnpm typecheck` | The types check. | No |
| `pnpm build` | The production build succeeds. | No |
| `pnpm verify:stack` | The app reaches Anthropic, Decodo, and SQLite. | Yes |
| `pnpm research [--model <m>] "question"` | One full research run works end to end. | Yes |
| `pnpm research:offline <scenario>` | The pipeline, the store, and the terminal output work end to end on fakes. | No |
| `pnpm runs list`, `pnpm runs show <id\|latest>` | What a stored run holds: budget, searches, pages, claims, report. | No |
| `pnpm verify:run <id\|latest>` | A stored run kept the PRD rules. The check uses its own code. | No (`--live` is paid) |
| `pnpm perf:check` | The bundle size and the parallel shape of the pipeline are inside their limits. | No |

- Run `pnpm check` before each commit.
- To run one test file, pass its path: `pnpm test lib/research/budget.test.ts`.
- To run tests by name, use `pnpm test -t "part of the test name"`.
- Run a paid command only when the task needs it.
- pnpm installs missing dependencies before it runs any script. For a check that changes no file at all, run `node scripts/doctor.mjs`.
- `pnpm dev` and `pnpm start` listen on `127.0.0.1` only. Pass `-p <port>` to pick a port.
- To read the database, run `sqlite3 -readonly -safe dev.db`. Without `-safe`, a dot command such as `.shell` can still change files.

## Rules that the checks enforce

`pnpm check` fails when code breaks one of these rules. Do not weaken a rule to make a check pass. Ask the user.

- No import of a package from the "Not in the stack" table of the tech stack.
- No call of a Decodo crawl method (W3).
- No model ID outside `lib/research/model-config.ts`.
- No `process.env` outside `lib/env.ts`, the config files, and `scripts/`.
- No route on the Edge runtime.
- Every package in `package.json` is one that the tech stack names.

The rules live in `biome.json`, `scripts/lint/`, and `scripts/project-rules.test.ts`.

## Done means

- `pnpm check` passes.
- The change is proven on the real thing: run the command, the page, or the script that the change affects, and read the actual result. For a change to the pipeline, the report, the budget, the CLI, or the stored run, use the `verify` skill (`.claude/skills/verify/SKILL.md`). Its helpers drive a run and audit it in one command.
- The evidence is kept: the command and its output go into the PR under Verification. The `verify` skill writes it to `.verify/`.
- A paid command runs only when the task needs it.

## Conventions

- Commits use Conventional Commits with a scope, for example `fix(research): ...`, `feat(research): ...`, or `chore(ci): ...`. The body says why.
- Branches are named `t3/<slug>`.
- A PR body has the sections Why, What changed, Scope, Tradeoffs, Blast Radius, and Verification. Leave out Tradeoffs when the change made no real choice.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
