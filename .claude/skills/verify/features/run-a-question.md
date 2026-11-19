# Ask a question and get a cited report

The user types one research question, in the prompt box of the web UI or in the terminal. The app shows each step while it happens, then shows a Markdown report. The report opens with a direct answer, cites a verified claim for each fact, and ends with a source list.

## Sub-features

- `run-live` answers a real question with real web pages and the real model.
- `run-offline` runs the same pipeline, store, and terminal output on fakes.
- `run-json` prints the run id on the first and the last line, and one JSON summary line at the end.
- `run-exit` exits with 0 for a completed run, 1 for a failed run, 2 for a usage error, and 3 for a cancelled run.
- `run-report` writes a report whose citations all point at verified claims and whose source list has a title, a domain, a label, and a link for each source.
- `run-no-claims` writes a short report that says no claim was verified and lists the searches (R6).
- `run-web` starts a run from the prompt box, shows each action in the Activity list while it happens, and streams the report (U1, U3).
- `run-web-model` lets the user choose the model in the prompt box and shows the model on the run (M1, M3).
- `run-web-error` keeps the question in the prompt box and shows the error there when a run cannot start.

## How to get to it (user POV)

- Run `pnpm research "<question>"` in a terminal.
- Run `pnpm research --json "<question>"` from a script.
- Run `pnpm research:offline <scenario>` for a run on fakes.
- Open the web UI at `/`, type a question in the prompt box, choose a model in the menu at its lower left, and press Enter or the round send button.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.
- For `run-live`, `pnpm doctor:worktree --live` passes both key checks.
- For a web recipe, `.claude/skills/verify/scripts/ui.sh <slug>` runs in the background and has printed `READY`. Its `URL:` line is `<URL>` and its `Evidence:` line is `<evidence folder>`.

- **Offline run.** Run `.claude/skills/verify/scripts/prove.sh run-offline offline completed`. The last lines read `PASS: 21 pass, 0 fail, 0 warn, 1 skip` and `drive exit code 0, audit exit code 0`. `run.txt` reads `Status    completed, stopped by answered` and `Claims: 2 verified, 0 dropped (V1 0, V2 0)`.
- **Report.** Open `report.md` in the evidence folder. It opens with an `Answer` heading, has citation marks such as `[^1]`, and ends with a `## Sources` section. In `audit.txt` the rows `report.citations`, `report.sources`, `report.source-entries`, and `report.hygiene` read `PASS`.
- **JSON summary.** Read the last line of `terminal.log`. It is one JSON object with `runId`, `status`, `stoppedBy`, `exitCode`, `wallMs`, and the counts.
- **No verified claim.** Run `.claude/skills/verify/scripts/prove.sh run-no-claims offline no-claims`. `run.txt` reads `stopped by dead-end` and `Report: written by code`. `report.md` starts with `# No verified claims` and has a `## Searches of the run` section.
- **Ask in the browser.** Run `node .claude/skills/verify/scripts/browser.mjs --base <URL> --out <evidence folder> .claude/skills/verify/scripts/steps/ask-and-watch.json`. It chooses Haiku 5.5, asks `failures`, and waits for the end. Every line reads `PASS`, among them `the Activity list has the 11 actions of the failures scenario (U3)` and `the run shows its model under the question (M3)`. The last line reads `console: no error and no warning`. Look at `running.png`: the header reads `Running`, the card that waits for the report names the current action, and the budget meters are partly filled. Look at `completed.png`: the header holds only the question, the report starts under the question and has a numbered citation chip, and the budget card counts the whole run.
- **A start that fails.** A run that cannot be stored shows its error under the prompt box, and the question stays in the box. To drive it, copy a migrated database, make the copy read-only with `chmod 444`, and start `pnpm start` with `DATABASE_URL` set to the copy and `RESEARCH_MARSHAL_FAKES=0`. Ask any question. The box shows `attempt to write a readonly database` and keeps the question. No run is stored.
- **Usage error.** Run `pnpm research; echo "exit=$?"`. The command prints the usage text and `exit=2`. It makes no request.
- **Live run.** Run `.claude/skills/verify/scripts/prove.sh run-live live "How long do lithium iron phosphate batteries last?"`. It takes 75 to 120 seconds. `audit.txt` must show `PASS` for `v1.stored`, every `budget.*` row, `report.citations`, and `report.hygiene`. `v1.stored` is the independent quote check: every verified quote is on its stored page.
- **Live quotes on fresh pages.** Only when the change touches reading or quote matching, run `pnpm verify:run <runId> --live --db <path>` before cleanup removes the scratch database, or run it against `dev.db` for a run stored there. It re-fetches each cited page through the Decodo CLI. It makes one paid request for each cited page.

## Gotchas

- A live run on the same question gives different pages and counts each time. Compare states and rules, not numbers.
- `report.uncited` is a warning. A report can still contain a factual sentence without a citation (issue #7). Read the listed sentences.
- A live run usually drops about half of the draft claims at the V2 check. That is the check working.
- `pnpm` prints `[ELIFECYCLE] Command failed` for every exit code other than 0, also for the expected 2 and 3.
- In the browser on fakes, the text of the question picks the scenario. The question `failures` runs the `failures` scenario, and the run is stored with the question `failures`.
- The send button and the Enter key do nothing while the prompt box is empty. The box takes at most 2,000 characters.
- A missing API key never reaches the prompt box. The server checks both keys when it starts and stops there.
- The offline report is a few words long. `prove.sh` passes `--fakes` to the audit, which skips `report.length` for that reason.
