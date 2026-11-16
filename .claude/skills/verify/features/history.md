# Come back to a past run

Every run is stored when it happens, including a cancelled run. The user can list the past runs and open one. A past run shows the question, the date, the report, every step, every page with its state, and every dropped claim.

## Sub-features

- `history-list` lists every stored run with its date, status, and counts (U8).
- `history-show` shows one full run (U9).
- `history-json` exports one run as JSON, as the `RunRecord` type in `lib/research/index.ts`.
- `history-report` prints only the report of a run.
- `history-cancelled` keeps a cancelled run in the list.

## How to get to it (user POV)

- Run `pnpm runs list`.
- Run `pnpm runs show <id>` or `pnpm runs show latest`.
- Run `pnpm runs show <id> --json` or `pnpm runs show <id> --report`.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.
- For a look at real runs, `dev.db` holds at least one run. `pnpm runs list` prints one row for each.

- **Stored and read back.** Run `.claude/skills/verify/scripts/prove.sh history offline completed`. The helper reads the run back from the database after the drive. `run.json` has the keys `summary`, `view`, and `events`. `report.md` equals the `markdown` field of the last `report.finished` event in `run.json`.
- **Same run in the list.** Before the helper exits, the scratch database is gone. To see the list, create your own database: run `export DATABASE_URL=file:$PWD/.verify/history-list.db`, then `pnpm db:migrate`, then `pnpm research:offline completed` and `pnpm research:offline failures`, then `pnpm runs list`. The list has two rows with the status `completed`. Remove the file and run `unset DATABASE_URL` afterwards.
- **Cancelled run kept.** Run `.claude/skills/verify/scripts/cancel-run.sh history-cancelled offline`. `run.txt` reads `Status    cancelled`, so the run was stored and can be opened.
- **Real history, read only.** Run `pnpm runs list` and `pnpm runs show latest` without `DATABASE_URL` in the shell. They read `dev.db` and change nothing.

## Gotchas

- `DATABASE_URL` in the shell wins over `.env.local` for every command. Unset it when you are done, or the next command reads the wrong database.
- The JSON shape is the app's own `RunView` plus the raw events. Do not build a second model of a run in a script. Read the type.
- A run stored before a change to the events still loads. Old runs show `reads.planned` events, and new runs show `reads.queued` and `reads.finished`.
- The web history (U8 to U10) and the rerun button do not exist yet. They arrive with the UI.
