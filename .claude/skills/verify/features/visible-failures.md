# See every failure of a run

The run shows what went wrong and never hides it. The user sees every search, including one without results. The user sees every page with one state: read, failed, or skipped. The user sees every dropped claim with its quote and the check that it failed.

## Sub-features

- `fail-search-empty` shows a search that returned no result (F2).
- `fail-search-failed` shows a failed search with the reason (F2).
- `fail-page` shows a failed page with the reason (F1).
- `fail-skipped` shows each skipped page with the reason: not selected, over the budget, or site refused (F1).
- `fail-claim` shows each dropped claim with the failed check, V1 or V2, and the reason (F3, V3).
- `fail-kept` keeps every failure in the stored run (F4).
- `fail-web` shows each of these failures as its own row in the Activity list of the web UI, and each dropped claim in the Claims tab (F1 to F4).

## How to get to it (user POV)

- Read the step lines while `pnpm research` runs.
- Read the summary that `pnpm research` prints at the end.
- Run `pnpm runs show <id|latest>` for a stored run. Add `--all` to list every skipped page.
- In the web UI, open a run and read the Activity tab of the progress panel. Press a row to see its details. The Claims tab has a filter for the dropped claims.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.
- For a web recipe, `.claude/skills/verify/scripts/ui.sh <slug>` runs in the background and has printed `READY`. Its `URL:` line is `<URL>` and its `Evidence:` line is `<evidence folder>`.

- **Failed searches and pages.** Run `.claude/skills/verify/scripts/prove.sh failures offline failures`. `run.txt` reads `Searches: 3 (1 without results, 1 failed)`, a line with `empty` and `no results`, a line with `failed` and `timeout`, and `Pages: 1 read, 1 failed, 1 skipped` with a `failed` line that ends in `«HTTP 404»`.
- **What the user saw.** Read the end of `terminal.log`. It reads `Pages: 3 found, 1 read, 1 failed, 1 skipped.`, then `Failed, http-status: 1` with the URL, then `Skipped, not selected: 1` with the URL.
- **Dropped claims.** Run `.claude/skills/verify/scripts/prove.sh dropped offline dropped`. `run.txt` reads `Claims: 1 verified, 2 dropped (V1 1, V2 1)`, and each dropped claim shows its quote and its reason.
- **Failures in the browser.** Run `node .claude/skills/verify/scripts/browser.mjs --base <URL> --out <evidence folder> .claude/skills/verify/scripts/steps/failures.json`. It opens the stored `failures` run and the stored `dropped` run and expands their rows. Every line reads `PASS`: a search without results (F2), a failed search with `timeout: no answer within 150 s` (F2), a failed page with `http-status: HTTP 404` (F1), a skipped page with its reason (F1), and both kinds of dropped claim with quote and reason (F3). Look at `failures.png` and `dropped.png`: a failed row has a red ring and the word `failed`, and a dropped claim is struck through with `Failed V1` or `Failed V2` under it.
- **Independent count.** In `audit.txt` of both proofs the rows `visible.pages`, `visible.searches`, and `visible.claims` read `PASS`. They count the events in SQLite without the app's code. The counts must equal the counts in `run.txt`.
- **Failures on real pages.** Only when the change touches the Decodo adapter or the read path, run `.claude/skills/verify/scripts/prove.sh failures-live live "Is moderate alcohol consumption good or bad for your heart?"`. This question reaches sites that Decodo refuses. Expect failed pages with `unsupported` or `rejected` and skipped pages with `site-refused` in `run.txt`.

## Gotchas

- No offline scenario has a refused site, an empty page, or a replaced read. Unit tests in `lib/research/budget.test.ts` cover those rules. Only a live run shows them end to end.
- `v1.drops` in the audit lists quotes that the app dropped for V1 although the audit finds them on the page. A row there is a finding about the quote check, not about visibility.
- The Activity list never removes a row. The unit test `never removes a row and never repeats an id as events arrive (F4)` in `lib/ui/activity.test.ts` replays every scenario event by event and checks that.
- A row in the Activity list is closed by default. A failure is visible in the closed row as a word and an icon. The reason is inside the row.
- The human view of `pnpm runs show` shortens web text and marks it with `«»`. Use `--json` when you need the full text.
