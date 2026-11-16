---
name: verify
description: Drive Research Marshal the way a user does and prove a change works. The app answers one research question with a cited report, in the web UI (`pnpm dev`) and from the terminal (`pnpm research`), and stores every run in SQLite. Use it after any change to the research pipeline, the report, the budget, the CLI, the stored run, or the web UI, and whenever a task says "verify", "prove it works", or "check performance".
---

# Verify Research Marshal

Research Marshal has two user surfaces. In the web UI a user types a question in the prompt box, watches every step of the run, and reads the report with its citations. In the terminal a user runs `pnpm research "question"`. Both surfaces run the same pipeline and store every run in the same SQLite file, so a run that one surface starts can be read in the other.

Read `features/README.md` for the feature map. Each feature file is a recipe.

## Launch

A terminal drive is one process. The web UI needs a server, and the helper `ui.sh` starts and stops one.

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
| Prove one real run on another model | `.claude/skills/verify/scripts/prove.sh <slug> live --model <fable\|opus\|sonnet\|haiku> "<question>"` | Paid, the time depends on the model |
| Prove cancel on fakes | `.claude/skills/verify/scripts/cancel-run.sh <slug> offline` | Free, about 5 s |
| Prove cancel on a real run | `.claude/skills/verify/scripts/cancel-run.sh <slug> live 15 "<question>"` | Paid, about 20 s |
| Serve the web UI on fakes | `.claude/skills/verify/scripts/ui.sh <slug> [--port <n>] [--pace <ms>] [--prod]` | Free, runs until it gets SIGTERM |
| Check one flow of the web UI | `node .claude/skills/verify/scripts/browser.mjs --base <URL> --out <folder> .claude/skills/verify/scripts/steps/<flow>.json` | Free, 5 to 60 s |

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
| `*.png`, `server.log`, `seed.log` | A web proof: the screenshots of the step files, the log of the server, and the runs that `ui.sh` stored. |

A proof meets these standards:

- It drives the user path: `pnpm research`, `pnpm research:offline`, or the web UI in a browser. A unit test or a call into `lib/research` is not a proof of behavior.
- It shows the action and the stored result. The terminal output alone is not enough. Read the run back with `pnpm runs show`.
- It includes the audit. The audit does not import the app's checks, so it can disagree with the app. A `FAIL` row is a finding.
- A live proof states that it is one sample. A timing miss in `--timing` is a warning with numbers, never proof of a regression.
- The offline fakes replace only Decodo and Anthropic. A change to a prompt, to the Decodo adapter, or to how model output is parsed needs a live run.

Name the feature ID from the map and the evidence folder in your report.

## Cleanup

The helpers delete their scratch database when they exit. They start no process that outlives them. `ui.sh` runs until it gets SIGTERM or Ctrl-C, then stops the server that it started. `browser.mjs` closes its Chrome when the last step ends. `cancel-run.sh` signals only the `node` process of the run that it started. To stop a helper from outside, send it SIGTERM. It interrupts its own run first, and `prove.sh` still exports the stopped run. Ctrl-C in a terminal reaches the run directly.

- Never stop a process by name. Stop only a PID that you started.
- Never delete `.verify/`. It holds the evidence of every proof.
- Never write to `dev.db` for a proof. It is the user's history.

## Known limits

- Decodo refuses government sites such as `cdc.gov` and `gov.uk` (issue #9). A live run shows them as failed with `unsupported` and skips the rest of that site. That is expected.
- The audit lists sentences without a citation as a warning (`report.uncited`, R3). It is a heuristic. Read the sentences before you report them.
- The V2 check drops about half of the draft claims in a normal live run. A high count of V2 drops is not a failure.
- `v1.drops` in the audit can list a whole table row. The app rejects a quote that spans table cells on purpose, and the audit's looser check finds the row on the page. That row is not a defect.
- Each live model call stores one `model.called` event with its duration, its wait for one of the 6 model slots, and its tokens. The fake model makes no call, so an offline run prints `Model calls: none recorded.` and its timeline shows a model step as the gap between events, like a run stored before the event.
- pnpm installs missing dependencies before any script. `node scripts/doctor.mjs` is the only check that changes no file at all.

## Web UI

The web UI is the Next.js app: the start screen at `/` and one run at `/runs/<id>`. A run that the app starts executes inside the server process and streams to the browser over Server-Sent Events from `/runs/<id>/events`.

### Serve it on fakes

Run `.claude/skills/verify/scripts/ui.sh <slug>` in the background. It migrates a scratch database, stores one run of each offline scenario and one cancelled run, starts the server with `RESEARCH_MARSHAL_FAKES` set, and prints three lines: `URL: http://127.0.0.1:3210`, `Evidence: <folder>`, and `READY: ...`. It sends no paid request. Send SIGTERM to the helper to stop it. It stops its server, removes the scratch database, and keeps the evidence folder.

- `--prod` builds the app and serves the production build. Use it before you call a change done. `next dev` hides caching mistakes.
- `--pace <ms>` sets how long each fake web call and model step takes. The default is 150. Raise it to watch a run slowly.
- On fakes the question picks the scenario. A question that is exactly `completed`, `failures`, `dropped`, `budget`, or `no-claims` runs that scenario. Any other question runs `completed`.

### Drive it

Two drivers work. Use the first when a tab is on screen, and the second for a proof that must not depend on a window.

- **The preview browser tools.** Open the URL with `preview_open` and a `target` of kind `environment-port`. Read the page with `preview_snapshot` and act with `preview_act`. A snapshot needs the T3 Code window on screen. When it is hidden, the tool answers that the browser produces no screenshot frames. `preview_evaluate` still reads the DOM then.
- **The headless driver.** `browser.mjs` drives the Chrome on this machine over the DevTools protocol. It takes a JSON list of steps: `goto`, `click`, `type`, `press`, `hover`, `waitText`, `expect`, `shot`, and more. The header of the file lists them all. It exits 1 when an expectation fails or when the page logs an error. Pass `--chrome <binary>` when Chrome is not in its usual place.

The step files under `scripts/steps/` are the recipes. Each one checks one flow against the PRD and prints one `PASS` or `FAIL` line per expectation.

| Step file | Checks |
| --- | --- |
| `ask-and-watch.json` | Ask a question, choose the model, watch the run live, read the report, reload the stored run (U1, U3, U4, M1, M3, U9). |
| `citation.json` | Hover and focus a citation, the source link, the source lists (U6, U7, S3, R7). |
| `failures.json` | Every failure of the `failures` and `dropped` scenarios (F1 to F3). |
| `budget.json` | The budget meters, the rounds, the map, the pages over the budget (U4, B1 to B6). |
| `cancel-and-rerun.json` | Reload a running run, cancel it, rerun it (U5, U8, U10, M4). |
| `history.json` | The history, its filter, a past run, a run without a verified claim, an unknown run (U2, U8, U9, R6). |
| `screens.json` | Light and dark theme, theme after a reload, reduced motion, 390px width. |
| `reconnect.json` | An event stream that closed for good opens again, and the run says that the connection was lost. |

Run all of them against one served app:

```sh
for flow in history citation failures budget ask-and-watch cancel-and-rerun screens reconnect; do
  node .claude/skills/verify/scripts/browser.mjs --base http://127.0.0.1:3210 \
    --out <evidence folder> .claude/skills/verify/scripts/steps/$flow.json || echo "FAILED: $flow"
done
```

Run `history`, `citation`, `failures`, and `budget` before the two flows that start runs. They pick a seeded run by its place and its text in the history.

### What a proof of the web UI needs

- The served app and a real browser. A unit test of `lib/ui` is not a proof of what the user sees.
- The `PASS` lines of the step file, and a look at each screenshot. Read the image. An expectation checks text and attributes, not the layout.
- The line `console: no error and no warning`. A hydration warning shows up there.
- One pass on the production build (`ui.sh --prod`) for a change to a page, a Server Action, the route handler, or caching.
- For the ASCII art, a screenshot that you zoom into. Add `"scale": 3` to the `viewport` step and `"clip": [x, y, width, height]` to the `shot` step. You must see glyphs.

### Limits of the web proof

- The fakes replace Decodo and Anthropic. A proof on fakes shows the UI and the event stream. It does not show a real report, real model durations, or a long real run. One live run in the browser covers those, and it is paid.
- A fake model records no `model.called` event. The Activity list then shows the time between two events as the duration of a model step. A live run shows the measured time.
- Next.js keeps up to 3 earlier pages in the document, hidden. `document.querySelector` can return an element of a hidden page. In a step, use `$v(selector)` for the first match on screen and `$$v(selector)` for all of them.
- One checkout runs one `next dev`. A second one stops with `Another next dev server is already running`. Use `ui.sh --prod` beside a running dev server, or stop the dev server first.
- The server checks the two API keys when it starts, also on fakes. A missing key stops the server before any page loads.
- A run whose row says `running` and that no server process owns stays `running`. The Cancel button then answers that the run cannot be cancelled here. That is the stored state, not a defect of the UI.
