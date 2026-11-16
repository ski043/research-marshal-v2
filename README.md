<img src="assets/icon.svg" width="64" height="64" alt="">

# Research Marshal

## Getting started

### Prerequisites

- Node.js 26 (the major in `.nvmrc`)
- pnpm 12 (the version in the `packageManager` field of `package.json`)

### The durable env file

The two API keys live in one file outside the repository: `~/.config/research-marshal/env`. Every worktree copies its keys from this file. Create it once:

```sh
mkdir -p ~/.config/research-marshal
touch ~/.config/research-marshal/env
chmod 600 ~/.config/research-marshal/env
```

Then add one line per key:

```sh
ANTHROPIC_API_KEY=<your Anthropic API key>
DECODO_AUTH_TOKEN=<your Decodo Web Data API key>
```

To use a different file, set `RESEARCH_MARSHAL_ENV` to its path.

### Set up a worktree

Run `pnpm bootstrap` in the repository root. It does these steps:

1. It checks the Node.js and pnpm versions.
2. It creates `.env.local` (mode 600) from the durable file and adds `DATABASE_URL=file:./dev.db`. When `.env.local` exists, it adds only the variables that are missing and keeps every existing value.
3. It runs `pnpm install --frozen-lockfile`, generates the Prisma client, and applies the database migrations.
4. It sets mode 600 on the SQLite file.
5. It runs the doctor and prints `READY` or `NOT READY` with the list of what is missing.

You can run `pnpm bootstrap` again at any time. When the worktree is ready, it changes nothing. When the durable file is missing or lacks a key, it names the key, does the other steps, and exits with a non-zero code.

To check a worktree without changing it, run `pnpm doctor:worktree`. Each failed check prints the command that fixes it.

### Environment variables

The app reads these variables. `.env.example` lists the names.

| Variable | Holds |
| --- | --- |
| `ANTHROPIC_API_KEY` | The Anthropic API key. |
| `DECODO_AUTH_TOKEN` | The Decodo API key. |
| `DATABASE_URL` | The path of the SQLite file, for example `file:./dev.db`. Each worktree has its own file. |

The app, `pnpm research`, `pnpm db:migrate`, `pnpm verify:stack`, and the doctor load `.env.local` and `.env` from the repository root. When both set a variable, `.env.local` wins. A variable that is set in the shell wins over both files. If a variable is missing or empty, the app stops with an error that names the variable and the fix.

### First run

1. Run `pnpm bootstrap`.
2. Run `pnpm research "How long do lithium iron phosphate batteries last?"`.

The terminal shows each step as it happens. At the end it prints the report between the lines `===== REPORT =====` and `===== END REPORT =====`, the list of Decodo calls, the dropped claims, the budget use, and the run status. Press Ctrl-C to cancel the run. A cancelled run writes no report. The first and the last line name the run ID. Add `--json` to end with one JSON summary line: the run ID, the status, the counts, and the wall time.

The command exits with one of these codes:

| Code | Meaning |
| --- | --- |
| 0 | The run completed. |
| 1 | The run failed. |
| 2 | Usage error, for example an empty question. |
| 3 | You cancelled the run with Ctrl-C. |
| 130 | You pressed Ctrl-C twice. The command quit at once. |

### Commands

| Command | Does |
| --- | --- |
| `pnpm bootstrap` | Sets up the worktree: env file, dependencies, Prisma client, database. |
| `pnpm doctor:worktree` | Checks whether the worktree is ready. Add `--json` for JSON output. Add `--live` to check that both keys work: one free Anthropic request and one paid Decodo request. |
| `pnpm install` | Installs the dependencies and generates the Prisma client. |
| `pnpm db:generate` | Generates the Prisma client from `prisma/schema.prisma`. |
| `pnpm db:migrate` | Applies the database migrations to the SQLite file. |
| `pnpm research "question"` | Runs one research question from the terminal. The run makes real paid requests to Anthropic and Decodo. |
| `pnpm research:offline <scenario>` | Runs the pipeline on the fake web and model of a named scenario. It makes no network request and needs only `DATABASE_URL`. Run it with an unknown name to list the scenarios. Add `--pace <ms>` to space the steps out in time. |
| `pnpm runs list` | Lists every stored run with its counts. |
| `pnpm runs show <id\|latest>` | Shows one stored run: status, budget use, searches, pages, claims, report, and timeline. Add `--json` for the whole run as JSON or `--report` for only the report. Use `pnpm -s` when a script reads the output. |
| `pnpm dev` | Starts the development server on `127.0.0.1`. |
| `pnpm build` | Builds the app for production. |
| `pnpm start` | Starts the production server on `127.0.0.1`. |
| `pnpm test` | Runs the unit tests. The tests make no network requests. |
| `pnpm lint` | Checks lint and formatting with Biome. |
| `pnpm typecheck` | Checks the types with TypeScript. |
| `pnpm verify:stack` | Checks that the app reaches Anthropic, Decodo, and SQLite. The check makes real paid requests. |
