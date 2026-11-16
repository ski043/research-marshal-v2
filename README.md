<img src="assets/icon.svg" width="64" height="64" alt="">

# Research Marshal

## Getting started

### Prerequisites

- Node.js 26
- pnpm 12

### Environment variables

Create a `.env.local` file in the repository root with these variables. A `.env` file also works. When both exist, `.env.local` wins.

| Variable | Holds |
| --- | --- |
| `ANTHROPIC_API_KEY` | The Anthropic API key. |
| `DECODO_AUTH_TOKEN` | The Decodo API key. |
| `DATABASE_URL` | The path of the SQLite file, for example `file:./dev.db`. |

If a variable is missing or empty, the app stops with an error that names the variable.

### First run

1. Run `pnpm install`.
2. Run `pnpm db:migrate` to create the SQLite file and its tables.
3. Run `pnpm research "How long do lithium iron phosphate batteries last?"`.

The terminal shows each step as it happens. At the end it prints the report between the lines `===== REPORT =====` and `===== END REPORT =====`, the list of Decodo calls, the dropped claims, the budget use, and the run status. Press Ctrl-C to cancel the run. A cancelled run writes no report. The command exits with code 0 only when the run completed.

### Commands

| Command | Does |
| --- | --- |
| `pnpm install` | Installs the dependencies and generates the Prisma client. |
| `pnpm db:migrate` | Applies the database migrations to the SQLite file. |
| `pnpm research "question"` | Runs one research question from the terminal. The run makes real paid requests to Anthropic and Decodo. |
| `pnpm dev` | Starts the development server. |
| `pnpm build` | Builds the app for production. |
| `pnpm test` | Runs the unit tests. The tests make no network requests. |
| `pnpm lint` | Checks lint and formatting with Biome. |
| `pnpm typecheck` | Checks the types with TypeScript. |
| `pnpm verify:stack` | Checks that the app reaches Anthropic, Decodo, and SQLite. The check makes real paid requests. |
