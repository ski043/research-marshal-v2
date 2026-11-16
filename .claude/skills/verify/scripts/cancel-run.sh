#!/usr/bin/env bash
# Starts one run, interrupts it the way Ctrl-C does, and records what the app did.
# It signals only the node process of the run that it started.
set -u

usage() {
  cat >&2 <<'USAGE'
Usage:
  cancel-run.sh <slug> offline [seconds]            free: the budget scenario, paced
  cancel-run.sh <slug> live [seconds] "<question>"  paid: a real run

It waits <seconds> (default 3 offline, 15 live), sends SIGINT, and expects
exit code 3, the stored status cancelled, and no report.
Evidence goes to .verify/<slug>-<UTC time>-<random>/.
USAGE
  exit 2
}

[ $# -ge 2 ] || usage
slug=$1
mode=$2
case "$mode" in
  offline)
    wait_s=${3:-3}
    drive=(pnpm -s research:offline budget --pace 400 --json)
    ;;
  live)
    [ $# -ge 4 ] || usage
    wait_s=$3
    drive=(pnpm -s research --json "$4")
    ;;
  *) usage ;;
esac

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
# shellcheck source=lib.sh
. "$root/.claude/skills/verify/scripts/lib.sh"
evidence=$(new_evidence_dir "$root" "$slug") || exit 1
db="$evidence/run.db"
trap 'rm -f "$db" "$db-journal" "$db-wal" "$db-shm"' EXIT
# A signal to this helper does not reach the run. Stop the run, then leave.
trap 'interrupt_runs; wait; exit 130' INT TERM

export DATABASE_URL="file:$db"
pnpm -s db:migrate >"$evidence/migrate.log" 2>&1 || {
  echo "NOT PROVEN: the scratch database did not migrate. See $evidence/migrate.log" >&2
  exit 1
}

"${drive[@]}" >"$evidence/terminal.log" 2>&1 &
top=$!
# A plain sleep would hold a signal back until it ends.
sleep "$wait_s" &
wait $!

leaf=$(nodes_below "$top" | tail -1)
if [ -z "$leaf" ]; then
  wait "$top"
  echo "NOT PROVEN: the run ended before the interrupt (exit code $?). Use fewer seconds. Evidence: $evidence" >&2
  exit 1
fi

sent=$(date +%s)
kill -INT "$leaf"
wait "$top"
exit_code=$?
took=$(($(date +%s) - sent))

run_id=$(grep -o 'Run [a-z0-9]\{20,\}' "$evidence/terminal.log" | head -1 | cut -d' ' -f2)
pnpm -s runs show "$run_id" --json >"$evidence/run.json" 2>/dev/null
pnpm -s runs show "$run_id" >"$evidence/run.txt" 2>/dev/null
status=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(r.summary.status+" report="+(r.view.report===null?"none":"present"))' "$evidence/run.json" 2>/dev/null)
survivors=$(descendants "$top" | wc -l | tr -d ' ')

{
  echo "commit: $(git rev-parse HEAD)"
  echo "command: ${drive[*]}"
  echo "interrupted node pid $leaf after ${wait_s}s"
  echo "exit code: $exit_code"
  echo "seconds from SIGINT to exit: $took"
  echo "stored: $status"
  echo "processes left: $survivors"
} | tee "$evidence/drive.txt"
echo "Evidence: $evidence"
[ "$exit_code" -eq 3 ] && [ "$status" = "cancelled report=none" ] && [ "$survivors" -eq 0 ]
