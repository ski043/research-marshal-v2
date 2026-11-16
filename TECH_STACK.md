# Research Marshal tech stack

Status: draft 3, 2026-11-16.

This document defines the technologies that Research Marshal uses. [PRD.md](PRD.md) defines what the product does. Requirement IDs such as W2 and V1 refer to the PRD.

The versions in this document are the current releases on npm on 2026-11-15. Prisma is the exception. See [Database](#database).

## What the PRD fixes

Version 1 runs locally for one user. It has no accounts and no hosted service. Three choices follow from that.

- The app is one Next.js process on Node.js.
- The database is one SQLite file.
- A run executes inside the Next.js process. The stack has no job queue, no worker process, and no workflow engine.

## Stack

| Area | Technology | Version | Purpose |
| --- | --- | --- | --- |
| Runtime | Node.js | 26 | Runs the app. |
| Package manager | pnpm | 12 | Installs the dependencies and runs the scripts. |
| Language | TypeScript, strict mode | 7.0 | All app code. |
| Framework | Next.js with the App Router | 16.4 | Pages, Server Actions, and the route handler that streams a run. |
| UI library | React | 19.3 | All components. |
| Styling | Tailwind CSS with `@tailwindcss/turbopack` | 4.3 | All styles. |
| Components | shadcn/ui with the default `base-nova` style | CLI 4.23 | The prompt box (U1), the citation popover (U6), the source lists (S3), and the history (U8). |
| Icons | lucide-react | 1.x | The default icon library of shadcn/ui. |
| Component support | `@base-ui/react`, `class-variance-authority`, `cn`, `tw-animate-css` | | The packages that the shadcn/ui components import. The shadcn CLI adds them. |
| Report rendering | Streamdown | 2.7 | Renders the report (R1) and turns each citation into a popover with a link (U6, U7). |
| Report cleanup | `mdast-util-from-markdown`, `micromark-extension-gfm`, `mdast-util-gfm`, and `mdast-util-to-markdown`, with `@types/mdast` | 2.1.0, 3.0.0, 3.1.0, 2.2.3, and 4.0.4 | Parses the model draft with the parser that Streamdown uses, keeps only the constructs that a report can contain, and writes the draft back as Markdown (R7, V4). |
| Validation | Zod | 4.6 | Parses the question, the environment variables, and the model output. |
| Web data | Decodo TypeScript SDK (`@decodo/sdk-ts`) | 3.0 | The three web actions (W2). |
| Model calls | AI SDK (`ai`) with `@ai-sdk/anthropic` | 7.0 and 4.0 | Every call to a model. |
| Model | Claude Fable 5.2, Claude Opus 5.5, Claude Sonnet 5.5, and Claude Haiku 5.5 | `claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5`, and `claude-haiku-5-5` | Every model step. The user chooses one model per run (M1, M2). |
| Database | SQLite | | Stores every run (U8, U9). |
| ORM | Prisma ORM with `@prisma/adapter-better-sqlite3` | 7.10.1 | The schema, the migrations, and the queries. |
| Tests | Vitest | 5.1 | Unit tests. |
| Lint and format | Biome | 2.6 | One tool for both jobs. |

## Next.js

- Use the App Router. The `app` directory is at the repository root. The project has no `src` directory.
- Use the import alias `@/*` for the repository root.
- Set `cacheComponents: true` and `partialPrefetching: true` in `next.config.ts`. The Next.js caching guide enables the two options together.
- `next.config.ts` has one Turbopack rule. It sends every CSS file through the `@tailwindcss/turbopack` loader.
- Use the Node.js runtime for every route. Prisma and SQLite do not run on the Edge runtime.
- Read data in Server Components. Change data in Server Actions.

### Cache Components

- Cache a finished run with `'use cache'`. A past run is read-only (U9), so the cached copy never goes out of date.
- Do not cache a run that is in progress, and do not cache the history list. Read both from the database at request time inside `<Suspense>`.

## Run execution

- A Server Action starts a run. The run continues in the Next.js process after the action returns.
- The app writes each step to SQLite when the step happens. The live view (U3) and the history (U9) read the same rows.
- One route handler sends the steps of a run to the browser as Server-Sent Events. The browser reads them with `EventSource`.
- Each run has one `AbortSignal`. A cancel (U5) aborts the signal. The run stops when the signal aborts.
- The app passes the signal to every model call.
- The app records each model call with its duration, its wait for a free model slot, and its token use.
- The Decodo SDK does not accept a signal. After a cancel, the app ignores the result of a Decodo request that is still open.
- Code enforces the budget (B1 to B3). No prompt enforces a limit.
- When `RESEARCH_MARSHAL_FAKES` is set, every run that the app starts uses the offline fakes instead of Decodo and Anthropic. The question picks the scenario by its name, and any other question runs the `completed` scenario. A run on the fakes sends no paid request and needs no API key.

## Web data

The app calls Decodo through `client.webScrapingApi` of the Decodo TypeScript SDK.

| Web action (W2) | SDK method |
| --- | --- |
| Search the web | `scrape({ target: Target.GoogleSearch, query, parse: true })` |
| Read one page | `scrape({ target: Target.Universal, url, markdown: true })` |
| Map one site | `map({ url, limit })` |

- Search uses the Google Search target of `scrape`. Do not use the `search` method. In 14 real calls it returned Google redirect links for half to three quarters of the results, and `scrape` rejects those links.
- Create the client with `apiKey`. The `map` method rejects a basic auth token.
- Set `timeoutMs` on the client. The default is 180 seconds.
- The SDK does not retry. It throws `AuthenticationError`, `RateLimitError`, `ValidationError`, `TimeoutError`, or `DecodoError`. The run records each error as a failed page or a failed search (F1, F2).
- The SDK types every response, but most response fields are optional. Check each field that the app needs.
- Never call a crawl method (W3).

## Report rendering

- Render the report with `<Streamdown>` in a Client Component.
- Add the line `@source "../node_modules/streamdown/dist/*.js";` to `app/globals.css`. Tailwind needs the line to generate the styles of Streamdown.
- Set `linkSafety={{ enabled: false }}`. By default, Streamdown shows a confirmation dialog before it opens a link, and the dialog breaks U7.
- Render citations through the `components` prop.
- Set `mode="static"` for a past run.
- Do not add a Streamdown plugin package. The report has no code blocks, no math, and no diagrams.

## Model calls

- Call Anthropic directly through `@ai-sdk/anthropic` with `ANTHROPIC_API_KEY`.
- Call the model one step at a time. Use `generateText` with `Output.object` and a Zod schema when a step returns data.
- The step that writes the report uses `streamText`. Streamdown renders the report while the model writes it.
- Do not use an agent loop. The budget fixes the number and the order of the web actions, so code decides the next action.
- The user chooses one of four models for a run (M1). The run uses that model for every model step (M2). The default is Claude Sonnet 5.5.
- One module maps each model and each model step to a model ID, an effort level, and an output limit. No other file names a model. The run and the history store a short key for the model, not the model ID.
- Every step sets its effort, because the default effort differs by model. A step has the same effort and the same output limit on every model.
- V1 is a string comparison in code. V1 is never a model call.
- V2 is its own model call. The call receives the claim and the quote. The call does not receive the output of the step that wrote the claim.
- R3 is checked after the report is written. The `classifySentences` step judges each sentence without a citation, the `repairSentences` step gets one chance to cite or rewrite a factual one, and code removes what still states a fact without a citation.

## Database

- Pin `prisma`, `@prisma/client`, and `@prisma/adapter-better-sqlite3` to version 7.10.1.
- Do not install `prisma@latest`. The `latest` tag on npm installs a release candidate of Prisma ORM 8. Install the CLI as `prisma@7.10.1`.
- The adapter installs `better-sqlite3`. Do not add `better-sqlite3` as a separate dependency. Add `@types/better-sqlite3` as a development dependency, because the type check fails without it.
- The Prisma configuration file is `prisma7.config.ts`. Load the environment variables in that file with `process.loadEnvFile()`. Do not add `dotenv`.
- Allow the build scripts of `better-sqlite3`, `prisma`, and `@prisma/engines` under `allowBuilds` in `pnpm-workspace.yaml`. pnpm blocks them by default.
- Git ignores the database file.

## Scripts

- `pnpm research` runs `scripts/research.ts` on Node.js without a build step. Node.js removes the types. `scripts/register.mjs` is a resolve hook that adds what Node.js lacks: the `@/` alias and imports without a file extension.
- The `verify` directory holds checks that make real paid requests. `pnpm verify:stack` runs them with its own Vitest configuration. `pnpm test` never runs them.

## Forms

The app has one form, the prompt box (U1). The form is a native `<form>` with a Server Action. Zod parses the question in the action.

## Tests

Write unit tests for logic that has no network access. The V1 comparison and the budget counters are the first two cases.

## Environment variables

| Variable | Holds |
| --- | --- |
| `ANTHROPIC_API_KEY` | The Anthropic API key. |
| `DECODO_AUTH_TOKEN` | The Decodo API key. |
| `DATABASE_URL` | The path of the SQLite file, for example `file:./dev.db`. |
| `RESEARCH_MARSHAL_FAKES` | Optional. The pace of the offline fakes in milliseconds, for example `0` or `150`. Unset means live runs. |

One module parses the environment variables with Zod when the app starts.

The two API keys live in one durable file outside the repository, `~/.config/research-marshal/env`. `RESEARCH_MARSHAL_ENV` can name a different file. `pnpm bootstrap` copies the keys into `.env.local` (mode 600), adds `DATABASE_URL`, installs the dependencies, and migrates the database.

## Checks and CI

`pnpm check` is the one free quality gate. It runs Biome with `--error-on-warnings`, the type check (`scripts/tsconfig.json` adds `scripts/*.mjs`), and the unit tests. It never sends a paid request.

Code enforces the rules of this document:

- Biome `noRestrictedImports` forbids each package of the "Not in the stack" table.
- Biome `noProcessEnv` and a GritQL plugin keep `process.env` in `lib/env.ts`, the config files, and `scripts/`.
- GritQL plugins in `scripts/lint/` forbid the Decodo crawl methods, a model ID outside `lib/research/model-config.ts`, and the Edge runtime.
- `scripts/project-rules.test.ts` proves that each rule fires. It also fails when `package.json` has a package that this document does not name.

The workflow `.github/workflows/check.yml` runs on each pull request and on each push to `main`. It needs no secret. It scans the git history for secrets, installs with a frozen lockfile, and runs `pnpm check`, `pnpm build`, and `pnpm audit --prod --audit-level=high`.

| Tool | Version | Purpose |
| --- | --- | --- |
| gitleaks | 8.30.1 | The secret scan in CI. CI downloads the release binary and checks its SHA-256. It is not an npm dependency. |
| `actions/checkout`, `actions/setup-node`, `pnpm/action-setup` | 7.0.1, 7.1.0, 6.1.1 | Set up the CI job. The workflow pins each action to a commit SHA. |

`.claude/settings.json` holds the project settings for Claude Code. It allows the free routine commands, denies reads of the env files, and runs `scripts/session-start.mjs` at the start of each session. The script runs the bootstrap when the worktree is not ready.

## Not in the stack

Do not add a technology from this table.

| Technology | Reason |
| --- | --- |
| React Hook Form | The app has one form with one field. |
| Vercel AI Gateway | The app uses one provider and already has its key. |
| `@ai-sdk/react` and `useChat` | A run is not a chat (U2). |
| Agent loops such as `ToolLoopAgent` | Code decides the next web action. |
| `@decodo/sdk` | This package is not the Decodo TypeScript SDK. The SDK is `@decodo/sdk-ts`. |
| The Decodo crawl methods | W3 forbids a crawl of a whole site. |
| react-markdown | Streamdown renders the report. |
| `dotenv` | Next.js and `process.loadEnvFile()` load the environment variables. |
| Prisma ORM 8 | Version 8 is a release candidate. |
| Drizzle | The project uses Prisma. |
| ESLint and Prettier | Biome does both jobs. The current typescript-eslint release does not accept TypeScript 7. |
| A job queue or a workflow engine | A run executes inside the Next.js process. |
| A client data library such as TanStack Query | Server Components read the data, and `EventSource` reads the live steps. |
| An authentication library | Version 1 has no accounts. |
| A hosting platform | Version 1 runs locally. |

## Checks

Two throwaway projects confirmed the following points on 2026-11-15, on Node.js 26.10 with pnpm 12.18. Neither project is part of this repository.

| Point | Result |
| --- | --- |
| Prisma 7.10.1 with SQLite | A migration and a query ran. The schema had an enum and a `Json` column. |
| Prisma 7.10.1 with TypeScript 7.0.2 | The generated client type-checks with `@types/better-sqlite3` installed. |
| Next.js 16.4.6 with TypeScript 7.0.2 and Cache Components | `next build` passed. |
| A run inside the Next.js process | A Server Action returned after 106 ms. The run then sent six steps over Server-Sent Events. |
| Cancel | An aborted signal stopped a run after two of six steps. |
| Streamdown 2.7.1 | The report page rendered a table and a citation link from the `components` prop. |
| Biome 2.6.7 | `biome check` ran on the Next.js project. |

The checks used `next start`. No check used `next dev`. No check sent a request to Decodo or to Anthropic.

## Changes to the stack

Ask the user before you add a dependency that this document does not list. Change this document only when the user asks you to.
