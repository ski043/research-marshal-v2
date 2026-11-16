# Research Marshal verification map

This directory is the maintained source for verifying what a user can do with Research Marshal. Read this index before you drive the app. Then use the matching feature file as the recipe.

| Feature | File | PRD |
| --- | --- | --- |
| Ask a question and get a cited report | [run-a-question.md](run-a-question.md) | U1, R1 to R7, V1 to V4 |
| Cancel a run | [cancel-a-run.md](cancel-a-run.md) | U5 |
| See every failure of a run | [visible-failures.md](visible-failures.md) | F1 to F4, V3 |
| Stay inside the budget | [budget.md](budget.md) | B1 to B7 |
| Come back to a past run | [history.md](history.md) | U8, U9 |

A proof that drives one entry point is incomplete when the feature file lists others.

## Baseline preconditions

- `pnpm bootstrap` ended with `READY: this worktree is ready.`
- `node scripts/doctor.mjs` exits 0.
- Every drive uses a scratch database. The helpers in `../scripts/` create one for each proof. `dev.db` is the user's history and no proof writes to it.

## Driving conventions

- Treat every command as literal. Keep the quoted names and flags unchanged.
- Run a whole proof through `../scripts/prove.sh` or `../scripts/cancel-run.sh`. Use the single commands only when a recipe names one.
- Start with the offline scenario. Add a live run when the change touches Decodo requests, prompts, or how model output is handled.
- A live run costs money. Run one only when the task needs it, and say that it is one sample.

## Proof and skip reporting

- Capture the action and the stored result. The evidence folder holds the terminal output, the run read back from the database, and the audit.
- Record the feature ID and the entry point with every evidence folder.
- Report an entry point that you could not drive, with the command you tried and what blocked it.
- Do not report a skipped entry point as verified through a different one. The offline scenario does not prove the live path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph on what the user sees. It then has exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with the proof helpers` starts with `Preconditions:` and pairs each user action with an exact command and the result to observe.
4. `Gotchas` lists traps that can waste or invalidate a run.
