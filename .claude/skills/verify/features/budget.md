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

## How to get to it (user POV)

- Read the first line of a run: `Run started. Budget: 3 rounds, ...`.
- Read `Budget used: ...` in the summary at the end of a run.
- Run `pnpm runs show <id|latest>` and read the `Budget (used / limit)` block.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.

- **Stop at the budget.** Run `.claude/skills/verify/scripts/prove.sh budget offline budget`. `run.txt` reads `Status    completed, stopped by budget`, `rounds   3 / 3`, three lines with `8 / 8 pages read`, and `maps     1 / 1 per run`.
- **Report still written.** `run.txt` has a `Report: written by model` line, and `report.md` is not empty.
- **Independent limits.** In `audit.txt` the rows `budget.rounds`, `budget.searches`, `budget.reads`, `budget.maps`, and `budget.no-reread` read `PASS`. The audit has the PRD numbers written in its own code and counts the Decodo requests in SQLite.
- **The audit can fail.** To see that the budget rows are real checks, run `pnpm test scripts/audit/checks.test.ts`. Its cases add a ninth read and a second map to a run and expect `FAIL`.
- **Budget on a real run.** Run a live proof from [run-a-question.md](run-a-question.md) and read the same five `budget.*` rows. A live round with failed pages shows more attempts than pages read, for example `8 / 8 pages read, 11 / 16 read attempts`.

## Gotchas

- A failed page does not count as a page read. It counts as an attempt (B7). A run stored before that rule shows 8 attempts as its limit.
- The offline `budget` scenario has no failed page, so it shows 8 attempts for 8 pages. It does not exercise the replacement of a failed read.
- The limits live in `BUDGET` in `lib/research/budget.ts`. A prompt never enforces a limit. A change that moves a limit into a prompt breaks the rule even if a run stays inside the numbers.
