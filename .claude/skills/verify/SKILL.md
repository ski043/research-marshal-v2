---
name: verify
description: Drive Research Marshal the way a user does and prove a change works. The app answers one research question with a cited report from the terminal (`pnpm research`), and stores every run in SQLite. Use it after any change to the research pipeline, the report, the budget, the CLI, or the stored run, and whenever a task says "verify", "prove it works", or "check performance".
---

# Verify Research Marshal

Research Marshal has one user surface today: the terminal. A user runs `pnpm research "question"`, watches the steps, and reads the report. Every run is stored in SQLite and can be read back. The web UI is not built yet (`app/page.tsx` is a placeholder), so no step here drives a browser.

Read `features/README.md` for the feature map. Each feature file is a recipe.

## Launch

The app has no server to keep alive. Each drive is one process.

1. Run `pnpm bootstrap`. It creates `.env.local`, installs the dependencies, generates the Prisma client, and migrates the database. It is safe to run again.
2. The last line must be `READY: this worktree is ready.`

If a key is missing, bootstrap names it. The keys live in `~/.config/research-marshal/env`. Ask the user to add a missing key there. Never print or copy a value from an env file.

## Doctor

Run `node scripts/doctor.mjs` first whenever anything looks off. It changes no file. Each failed check prints the command that fixes it, and the exit code is 0 only when the worktree is ready. `--json` prints the same result for a script.

`pnpm doctor:worktree --live` also proves that both API keys work. It makes one paid Decodo request.

## Drive

Two helpers do a whole proof in one command. Both use a scratch database inside the evidence folder, so a proof never touches `dev.db` and two proofs can run side by side.

| Goal | Command | Cost |
| --- | --- | --- |
| Prove one scenario on fakes | `.claude/skills/verify/scripts/prove.sh <slug> offline <scenario>` | Free, about 3 s |
| Prove one real run | `.claude/skills/verify/scripts/prove.sh <slug> live "<question>"` | Paid, 75 to 120 s |
| Prove cancel on fakes | `.claude/skills/verify/scripts/cancel-run.sh <slug> offline` | Free, about 5 s |
| Prove cancel on a real run | `.claude/skills/verify/scripts/cancel-run.sh <slug> live 15 "<question>"` | Paid, about 20 s |

`prove.sh` runs the doctor, migrates the scratch database, runs the drive, exports the run, and runs the independent audit. It exits 0 only when the run completed and no audit check failed.

The offline scenarios run the real pipeline, the real store, and the real terminal output. Only the web and the model are fakes.

| Scenario | End state |
| --- | --- |
| `completed` | A report with citations and a source list. |
| `failures` | One search without results, one failed search, one failed page, one skipped page. |
| `dropped` | One verified claim, one claim dropped for V1, one dropped for V2. |
| `budget` | 3 rounds, 8 pages read in each, 1 map, stopped by the budget, report still written. |
| `no-claims` | No verified claim. The report says so and lists the searches. |

Use a live run when the change touches what the fakes replace: Decodo requests, prompts, model output handling, or timing. One live run is one sample. It shows that the path works, not that a number improved.

### Commands behind the helpers

Use these directly when a recipe needs one step.

- `pnpm research:offline <scenario> [--pace <ms>] [--json]` runs a scenario. `--pace` spaces the events out in time.
- `pnpm research [--json] "<question>"` runs a real question. The run id is on the first and the last line. `--json` adds one summary line at the end.
- Exit codes of both: 0 completed, 1 failed, 2 usage error, 3 cancelled, 130 second Ctrl-C.
- `pnpm runs list` lists the stored runs. `pnpm runs show <id|latest>` shows one run: budget, searches, every page with its state, claims, report, timeline. `--all` lists every skipped page, `--json` prints the whole run, `--report` prints only the report.
- `pnpm verify:run <id|latest> [--self-test] [--timing] [--fakes] [--db <path>]` judges a stored run against the PRD with its own code, including its own quote check. It exits 1 when a check fails. Pass `--fakes` for an offline run.
- `DATABASE_URL=file:<absolute path>` in the shell points every command at another database. The shell value wins over `.env.local`. Run `pnpm db:migrate` with it once.
- To interrupt a run by hand, send SIGINT to the `node` process. `pnpm` and a shell sit above it and do not pass the signal on.

### Checks that need no run

- `pnpm check` runs lint, the type check, and the unit tests in about 2 s. It also runs the project rule checks.
- `pnpm perf:check` builds the app and gates the bundle size and the parallel shape of the pipeline. Free, about 15 s.
- `node --import ./scripts/register.mjs scripts/report-render-check.ts <path to a database>` renders every stored report and fails on an image, raw HTML, or a link outside the source list.

## Evidence

Evidence goes to `.verify/<slug>-<UTC time>-<random>/`. Git ignores the folder.

| File | Holds |
| --- | --- |
| `drive.txt` | The commit, the command, and the exit code. |
| `terminal.log` | What the user saw. |
| `run.json`, `run.txt`, `report.md` | The stored run, read back after the drive. |
| `audit.txt`, `audit.json` | The independent audit, one row per check. |
| `doctor.json` | The state of the worktree before the drive. |

A proof meets these standards:

- It drives the user path, `pnpm research` or `pnpm research:offline`. A unit test or a call into `lib/research` is not a proof of behavior.
- It shows the action and the stored result. The terminal output alone is not enough. Read the run back with `pnpm runs show`.
- It includes the audit. The audit does not import the app's checks, so it can disagree with the app. A `FAIL` row is a finding.
- A live proof states that it is one sample. A timing miss in `--timing` is a warning with numbers, never proof of a regression.
- The offline fakes replace only Decodo and Anthropic. A change to a prompt, to the Decodo adapter, or to how model output is parsed needs a live run.

Name the feature ID from the map and the evidence folder in your report.

## Cleanup

The helpers delete their scratch database when they exit. They start no process that outlives them. `cancel-run.sh` signals only the `node` process of the run that it started. A helper that receives SIGINT or SIGTERM interrupts its own run first, and `prove.sh` still exports the stopped run.

- Never stop a process by name. Stop only a PID that you started.
- Never delete `.verify/`. It holds the evidence of every proof.
- Never write to `dev.db` for a proof. It is the user's history.

## Known limits

- Decodo refuses government sites such as `cdc.gov` and `gov.uk` (issue #9). A live run shows them as failed with `unsupported` and skips the rest of that site. That is expected.
- The audit lists sentences without a citation as a warning (`report.uncited`, R3). It is a heuristic. Read the sentences before you report them.
- The V2 check drops about half of the draft claims in a normal live run. A high count of V2 drops is not a failure.
- `v1.drops` in the audit can list a whole table row. The app rejects a quote that spans table cells on purpose, and the audit's looser check finds the row on the page. That row is not a defect.
- Model steps store no start time and no token count (issue #19). The timeline shows a model step as the gap between events.
- pnpm installs missing dependencies before any script. `node scripts/doctor.mjs` is the only check that changes no file at all.

## Web UI

The UI is phase 3 and does not exist yet. `pnpm dev` serves the placeholder page on `http://127.0.0.1:3000`. When the UI lands, run `/maintain-verification-skill` to add browser recipes. Seed its data with `pnpm research:offline <scenario>`, so UI work needs no paid run.
