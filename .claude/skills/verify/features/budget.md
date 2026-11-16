# Stay inside the budget

A run has fixed limits that the user cannot change. It has at most 3 rounds. A round has at most 5 searches and at most 8 page reads, with at most 16 read attempts. A run has at most 1 map. When the budget ends, the app writes the report with the verified claims that it has.

## Sub-features

- `budget-rounds` opens at most 3 rounds (B1).
- `budget-searches` runs at most 5 searches in a round (B2).
- `budget-reads` reads at most 8 pages in a round and tries at most 16 (B2, B7).
- `budget-map` maps at most 1 site in a run (B3).
- `budget-no-reread` never reads the same page twice.
- `budget-report` still writes the report when the budget stops the run (B5).
- `budget-shown` shows the budget use in the terminal and in the stored run (U4).
- `budget-web` shows the budget as four meters in the progress panel of the web UI, and offers no setting for a limit (U4, B6).

## How to get to it (user POV)

- Read the first line of a run: `Run started. Budget: 3 rounds, ...`.
- Read `Budget used: ...` in the summary at the end of a run.
- Run `pnpm runs show <id|latest>` and read the `Budget (used / limit)` block.
- In the web UI, open a run and read the Budget card at the top of the progress panel. The start screen states the limits under the prompt box.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.
- For a web recipe, `.claude/skills/verify/scripts/ui.sh <slug>` runs in the background and has printed `READY`. Its `URL:` line is `<URL>` and its `Evidence:` line is `<evidence folder>`.

- **Stop at the budget.** Run `.claude/skills/verify/scripts/prove.sh budget offline budget`. `run.txt` reads `Status    completed, stopped by budget`, `rounds   3 / 3`, three lines with `8 / 8 pages read`, and `maps     1 / 1 per run`.
- **Report still written.** `run.txt` has a `Report: written by model` line, and `report.md` is not empty.
- **Budget in the browser.** Run `node .claude/skills/verify/scripts/browser.mjs --base <URL> --out <evidence folder> .claude/skills/verify/scripts/steps/budget.json`. It opens the stored `budget` run. Every line reads `PASS`: the meters show 3 of 3 rounds, 1 of 1 map and 8 of 8 pages (U4, B1 to B3), a query over the limit is shown as dropped, the pages over the limit are skipped with the reason (B2), the report is still there (B5), and the page has no input for a limit (B6). Look at `budget.png`: the Budget card has four meters, and the Activity list has the groups Round 1, Round 2 and Round 3.
- **Independent limits.** In `audit.txt` the rows `budget.rounds`, `budget.searches`, `budget.reads`, `budget.maps`, and `budget.no-reread` read `PASS`. The audit has the PRD numbers written in its own code and counts the Decodo requests in SQLite.
- **The audit can fail.** To see that the budget rows are real checks, run `pnpm test scripts/audit/checks.test.ts`. Its cases add a ninth read and a second map to a run and expect `FAIL`.
- **Budget on a real run.** Run a live proof from [run-a-question.md](run-a-question.md) and read the same five `budget.*` rows. A live round with failed pages shows more attempts than pages read, for example `8 / 8 pages read, 11 / 16 read attempts`.

## Gotchas

- A failed page does not count as a page read. It counts as an attempt (B7). A run stored before that rule shows 8 attempts as its limit.
- The offline `budget` scenario has no failed page, so it shows 8 attempts for 8 pages. It does not exercise the replacement of a failed read.
- The Budget card counts the searches and the pages of the current round. For a run that has ended, that is its last round.
- The Budget card shows the pages read, not the read attempts. The attempts of a round are in `pnpm runs show`.
- The limits live in `BUDGET` in `lib/research/budget.ts`. A prompt never enforces a limit. A change that moves a limit into a prompt breaks the rule even if a run stays inside the numbers.
