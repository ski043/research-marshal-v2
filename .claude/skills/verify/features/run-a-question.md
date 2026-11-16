# Ask a question and get a cited report

The user types one research question in the terminal. The app shows each step while it happens, then prints a Markdown report. The report opens with a direct answer, cites a verified claim for each fact, and ends with a source list.

## Sub-features

- `run-live` answers a real question with real web pages and the real model.
- `run-offline` runs the same pipeline, store, and terminal output on fakes.
- `run-json` prints the run id on the first and the last line, and one JSON summary line at the end.
- `run-exit` exits with 0 for a completed run, 1 for a failed run, 2 for a usage error, and 3 for a cancelled run.
- `run-report` writes a report whose citations all point at verified claims and whose source list has a title, a domain, a label, and a link for each source.
- `run-no-claims` writes a short report that says no claim was verified and lists the searches (R6).

## How to get to it (user POV)

- Run `pnpm research "<question>"` in a terminal.
- Run `pnpm research --json "<question>"` from a script.
- Run `pnpm research:offline <scenario>` for a run on fakes.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.
- For `run-live`, `pnpm doctor:worktree --live` passes both key checks.

- **Offline run.** Run `.claude/skills/verify/scripts/prove.sh run-offline offline completed`. The last lines read `PASS: 21 pass, 0 fail, 0 warn, 1 skip` and `drive exit code 0, audit exit code 0`. `run.txt` reads `Status    completed, stopped by answered` and `Claims: 2 verified, 0 dropped (V1 0, V2 0)`.
- **Report.** Open `report.md` in the evidence folder. It opens with an `Answer` heading, has citation marks such as `[^1]`, and ends with a `## Sources` section. In `audit.txt` the rows `report.citations`, `report.sources`, `report.source-entries`, and `report.hygiene` read `PASS`.
- **JSON summary.** Read the last line of `terminal.log`. It is one JSON object with `runId`, `status`, `stoppedBy`, `exitCode`, `wallMs`, and the counts.
- **No verified claim.** Run `.claude/skills/verify/scripts/prove.sh run-no-claims offline no-claims`. `run.txt` reads `stopped by dead-end` and `Report: written by code`. `report.md` starts with `# No verified claims` and has a `## Searches of the run` section.
- **Usage error.** Run `pnpm research; echo "exit=$?"`. The command prints the usage text and `exit=2`. It makes no request.
- **Live run.** Run `.claude/skills/verify/scripts/prove.sh run-live live "How long do lithium iron phosphate batteries last?"`. It takes 75 to 120 seconds. `audit.txt` must show `PASS` for `v1.stored`, every `budget.*` row, `report.citations`, and `report.hygiene`. `v1.stored` is the independent quote check: every verified quote is on its stored page.
- **Live quotes on fresh pages.** Only when the change touches reading or quote matching, run `pnpm verify:run <runId> --live --db <path>` before cleanup removes the scratch database, or run it against `dev.db` for a run stored there. It re-fetches each cited page through the Decodo CLI. It makes one paid request for each cited page.

## Gotchas

- A live run on the same question gives different pages and counts each time. Compare states and rules, not numbers.
- `report.uncited` is a warning. A report can still contain a factual sentence without a citation (issue #7). Read the listed sentences.
- A live run usually drops about half of the draft claims at the V2 check. That is the check working.
- `pnpm` prints `[ELIFECYCLE] Command failed` for every exit code other than 0, also for the expected 2 and 3.
- The offline report is a few words long. `prove.sh` passes `--fakes` to the audit, which skips `report.length` for that reason.
