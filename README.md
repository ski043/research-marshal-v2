<img src="assets/icon.svg" width="64" height="64" alt="">

# Research Marshal

## Getting started

### Prerequisites

- Node.js 26
- pnpm 12

### Environment variables

Create a `.env` file in the repository root with these variables.

| Variable | Holds |
| --- | --- |
| `ANTHROPIC_API_KEY` | The Anthropic API key. |
| `DECODO_AUTH_TOKEN` | The Decodo API key. |
| `DATABASE_URL` | The path of the SQLite file, for example `file:./dev.db`. |

If a variable is missing or empty, the server logs an error that names the variable, and every request fails.

### Commands

| Command | Does |
| --- | --- |
| `pnpm install` | Installs the dependencies and generates the Prisma client. |
| `pnpm dev` | Starts the development server. |
| `pnpm build` | Builds the app for production. |
| `pnpm test` | Runs the unit tests. The tests make no network requests. |
| `pnpm lint` | Checks lint and formatting with Biome. |
| `pnpm typecheck` | Checks the types with TypeScript. |
| `pnpm verify:stack` | Checks that the app reaches Anthropic, Decodo, and SQLite. The check makes real paid requests. |
