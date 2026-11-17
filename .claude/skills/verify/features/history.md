# Come back to a past run

Every run is stored when it happens, including a cancelled run. The user can list the past runs and open one, in the sidebar of the web UI or in the terminal. A past run shows the question, the date, the model, the report, every step, every page with its state, and every dropped claim.

## Sub-features

- `history-list` lists every stored run with its date, status, and counts (U8).
- `history-show` shows one full run (U9).
- `history-json` exports one run as JSON, as the `RunRecord` type in `lib/research/index.ts`.
- `history-report` prints only the report of a run.
- `history-cancelled` keeps a cancelled run in the list.
- `history-web` lists every run in the sidebar as one line, grouped by age (Today, Yesterday, Previous 7 days, Previous 30 days, then by month and by year), with a search over the questions (U8). A running run carries a pulsing dot. The state of every run is in the row as hidden text and in its tooltip.
- `history-web-run` opens a past run read-only, with its date and its model (U9, M3).
- `history-rerun` starts a new run with the question and the model of a past run and leaves the past run unchanged (U10, M4).
- `history-not-found` shows `Run not found` inside the shell for an unknown address.

## How to get to it (user POV)

- Run `pnpm runs list`.
- Run `pnpm runs show <id>` or `pnpm runs show latest`.
- Run `pnpm runs show <id> --json` or `pnpm runs show <id> --report`.
- In the web UI, press a run in the sidebar. Under 1024px width, open the sidebar with the menu button first.
- In the web UI, press Re-run in the header of a run that has ended.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.
- For a look at real runs, `dev.db` holds at least one run. `pnpm runs list` prints one row for each.
- For a web recipe, `.claude/skills/verify/scripts/ui.sh <slug>` runs in the background and has printed `READY`. Its `URL:` line is `<URL>` and its `Evidence:` line is `<evidence folder>`.

- **Stored and read back.** Run `.claude/skills/verify/scripts/prove.sh history offline completed`. The helper reads the run back from the database after the drive. `run.json` has the keys `summary`, `view`, and `events`. `report.md` equals the `markdown` field of the last `report.finished` event in `run.json`.
- **Same run in the list.** Before the helper exits, the scratch database is gone. To see the list, create your own database: run `export DATABASE_URL=file:$PWD/.verify/history-list.db`, then `pnpm db:migrate`, then `pnpm research:offline completed` and `pnpm research:offline failures`, then `pnpm runs list`. The list has two rows with the status `completed`. Remove the file and run `unset DATABASE_URL` afterwards.
- **Cancelled run kept.** Run `.claude/skills/verify/scripts/cancel-run.sh history-cancelled offline`. `run.txt` reads `Status    cancelled`, so the run was stored and can be opened.
- **History in the browser.** Run `node .claude/skills/verify/scripts/browser.mjs --base <URL> --out <evidence folder> .claude/skills/verify/scripts/steps/history.json`. Every line reads `PASS`: the history lists every seeded run and a cancelled one (U8), the filter narrows the list, a past run shows its date and its model (U9, M3) and has a rerun button (U10), and it has no input of any kind (U2, U9). The last two lines check an unknown address. Look at `no-claims.png` and `not-found.png`.
- **Rerun in the browser.** Run `node .claude/skills/verify/scripts/browser.mjs --base <URL> --out <evidence folder> .claude/skills/verify/scripts/steps/cancel-and-rerun.json`. The lines `the rerun is one more entry in the history (U10)`, `the old run is unchanged below the new one (U10)`, and `the rerun shows the model of the original run (M4)` read `PASS`.
- **Model calls and tokens.** In the `run.txt` of a live proof, the `Model calls:` line gives the calls, the summed time, the queue wait, and the tokens, with one row per step below it, and the timeline marks model time as `measured`. An offline proof prints `Model calls: none recorded.`, because the fake model makes no call.
- **Real history, read only.** Run `pnpm runs list` and `pnpm runs show latest` without `DATABASE_URL` in the shell. They read `dev.db` and change nothing.

## Gotchas

- `DATABASE_URL` in the shell wins over `.env.local` for every command. Unset it when you are done, or the next command reads the wrong database.
- The JSON shape is the app's own `RunView` plus the raw events. Do not build a second model of a run in a script. Read the type.
- A run stored before a change to the events still loads. Old runs show `reads.planned` events, and new runs show `reads.queued` and `reads.finished`.
- The sidebar is rendered by the server on each request and refreshed when a run ends. The page of a run that has ended is cached, because a past run never changes (U9).
- The times in the sidebar are relative for today (`now`, `12m`, `3h`) and a clock time for an earlier day. The server and the browser must share a time zone, as they do for a local app.
- A rerun on fakes picks its scenario from the question again, so a rerun of `budget` is another `budget` run.
