# See every failure of a run

The run shows what went wrong and never hides it. The user sees every search, including one without results. The user sees every page with one state: read, failed, or skipped. The user sees every dropped claim with its quote and the check that it failed.

## Sub-features

- `fail-search-empty` shows a search that returned no result (F2).
- `fail-search-failed` shows a failed search with the reason (F2).
- `fail-page` shows a failed page with the reason (F1).
- `fail-skipped` shows each skipped page with the reason: not selected, over the budget, or site refused (F1).
- `fail-claim` shows each dropped claim with the failed check, V1 or V2, and the reason (F3, V3).
- `fail-kept` keeps every failure in the stored run (F4).

## How to get to it (user POV)

- Read the step lines while `pnpm research` runs.
- Read the summary that `pnpm research` prints at the end.
- Run `pnpm runs show <id|latest>` for a stored run. Add `--all` to list every skipped page.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.

- **Failed searches and pages.** Run `.claude/skills/verify/scripts/prove.sh failures offline failures`. `run.txt` reads `Searches: 3 (1 without results, 1 failed)`, a line with `empty` and `no results`, a line with `failed` and `timeout`, and `Pages: 1 read, 1 failed, 1 skipped` with a `failed` line that ends in `«HTTP 404»`.
- **What the user saw.** Read the end of `terminal.log`. It reads `Pages: 3 found, 1 read, 1 failed, 1 skipped.`, then `Failed, http-status: 1` with the URL, then `Skipped, not selected: 1` with the URL.
- **Dropped claims.** Run `.claude/skills/verify/scripts/prove.sh dropped offline dropped`. `run.txt` reads `Claims: 1 verified, 2 dropped (V1 1, V2 1)`, and each dropped claim shows its quote and its reason.
- **Independent count.** In `audit.txt` of both proofs the rows `visible.pages`, `visible.searches`, and `visible.claims` read `PASS`. They count the events in SQLite without the app's code. The counts must equal the counts in `run.txt`.
- **Failures on real pages.** Only when the change touches the Decodo adapter or the read path, run `.claude/skills/verify/scripts/prove.sh failures-live live "Is moderate alcohol consumption good or bad for your heart?"`. This question reaches sites that Decodo refuses. Expect failed pages with `unsupported` or `rejected` and skipped pages with `site-refused` in `run.txt`.

## Gotchas

- No offline scenario has a refused site, an empty page, or a replaced read. Unit tests in `lib/research/budget.test.ts` cover those rules. Only a live run shows them end to end.
- `v1.drops` in the audit lists quotes that the app dropped for V1 although the audit finds them on the page. A row there is a finding about the quote check, not about visibility.
- The human view of `pnpm runs show` shortens web text and marks it with `«»`. Use `--json` when you need the full text.
