# Cancel a run

The user cancels a run that is in progress, with the Cancel button of the web UI or with Ctrl-C in the terminal. The run stops and the app writes no report. The cancelled run stays in the history.

## Sub-features

- `cancel-stop` stops the run within a few seconds of the first Ctrl-C.
- `cancel-exit` exits with code 3.
- `cancel-no-report` stores the status `cancelled` and no report (U5).
- `cancel-force` quits at once on a second Ctrl-C with exit code 130.
- `cancel-web` stops a run from the Cancel button in the header of the run and shows the cancelled state with no report (U5).
- `cancel-web-not-owned` says in one line that a run cannot be cancelled when this server process does not own it.

## How to get to it (user POV)

- Press Ctrl-C once in the terminal that runs `pnpm research` or `pnpm research:offline`.
- Press Ctrl-C a second time to quit at once.
- In the web UI, open a run that is running and press Cancel in its header.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.
- For a web recipe, `.claude/skills/verify/scripts/ui.sh <slug>` runs in the background and has printed `READY`. Its `URL:` line is `<URL>` and its `Evidence:` line is `<evidence folder>`.

- **Cancel on fakes.** Run `.claude/skills/verify/scripts/cancel-run.sh cancel-offline offline`. It starts the `budget` scenario with a pace of 400 ms, waits 3 seconds, and sends SIGINT to the `node` process of that run. `drive.txt` reads `exit code: 3`, `stored: cancelled report=none`, and `processes left: 0`. The helper exits 0 only when all three hold.
- **What the user saw.** Read `terminal.log`. It contains `Cancelling the run. Press Ctrl-C again to quit at once.`, then `(no report: the run is cancelled)`, then `Run status: cancelled`.
- **Stored state.** Read `run.txt`. It reads `Status    cancelled` and `Report: none (the run is cancelled).`
- **Cancel in the browser.** Run `node .claude/skills/verify/scripts/browser.mjs --base <URL> --out <evidence folder> .claude/skills/verify/scripts/steps/cancel-and-rerun.json`. It asks `budget`, reloads the page while the run is running, and presses Cancel. The lines `a cancelled run shows no report (U5)` and `the history keeps the cancelled run (U8)` read `PASS`. Look at `cancelled.png`: the header holds only the question, the page says `This run was cancelled` above its Re-run button, and the Activity list ends with an `end` row that reads `cancelled`.
- **Cancel a real run.** Only when the change touches how a Decodo request or a model call ends, run `.claude/skills/verify/scripts/cancel-run.sh cancel-live live 15 "What is the boiling point of water at the summit of Mount Everest?"`. It is paid. The same three lines must hold.

## Gotchas

- `pnpm research` is three processes: `pnpm`, a shell, and `node`. A signal to `pnpm` or the shell does not reach the run. The helper signals the `node` process.
- A run that ends before the interrupt proves nothing. The helper reports `NOT PROVEN` and asks for fewer seconds.
- The Decodo SDK takes no abort signal. After a cancel the app ignores the answer of an open Decodo request. The run still ends at once.
- The Cancel button works only in the server process that started the run. After a restart of the server, a run that was in progress keeps the status `running`, and Cancel answers `This run is not running in this app process, so it cannot be cancelled here.` To see it, start `pnpm research:offline budget --pace 400` against the scratch database of `ui.sh`, stop its `node` process with SIGKILL, and open the run in the browser.
- `cancel-force` has no helper. To drive it, send SIGINT twice to the `node` process and expect exit code 130.
