#!/usr/bin/env bash
# One proof of one run: doctor, scratch database, drive, export, independent audit, cleanup.
# The evidence folder survives. The scratch database does not.
set -u

usage() {
  cat >&2 <<'USAGE'
Usage:
  prove.sh <slug> offline <scenario> [--pace <ms>]   free, runs on fakes
  prove.sh <slug> live "<question>"                  paid, real Decodo and Anthropic calls

Scenarios: completed, failures, dropped, budget, no-claims.
Evidence goes to .verify/<slug>-<UTC time>-<random>/.
USAGE
  exit 2
}

[ $# -ge 3 ] || usage
slug=$1
mode=$2
shift 2
case "$mode" in
  offline)
    drive=(pnpm -s research:offline "$@" --json)
    audit_flags="--fakes"
    ;;
  live)
    drive=(pnpm -s research --json "$@")
    audit_flags=""
    ;;
  *) usage ;;
esac

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
# shellcheck source=lib.sh
. "$root/.claude/skills/verify/scripts/lib.sh"
evidence=$(new_evidence_dir "$root" "$slug") || exit 1
db="$evidence/run.db"

# The scratch database goes only after the audit has read it. Without an audit it is
# the only copy of the run, so it stays.
audited=no
cleanup() {
  if [ "$audited" = yes ]; then
    rm -f "$db" "$db-journal" "$db-wal" "$db-shm"
  elif [ -f "$db" ]; then
    echo "The audit did not run. The scratch database stays at $db" >&2
  fi
}
trap cleanup EXIT
# SIGTERM to this helper does not reach the run, so pass it on as an
# interrupt. Ctrl-C in a terminal reaches the run by itself, and a second
# interrupt would make the run quit before it stores its cancel. Either way
# the helper goes on to the export, so the evidence of the stopped run is kept.
trap interrupt_runs TERM
trap : INT

if ! node scripts/doctor.mjs --json >"$evidence/doctor.json" 2>"$evidence/doctor.err"; then
  node scripts/doctor.mjs
  echo "NOT PROVEN: the worktree is not ready. Run pnpm bootstrap. Evidence: $evidence" >&2
  exit 1
fi

export DATABASE_URL="file:$db"
if ! pnpm -s db:migrate >"$evidence/migrate.log" 2>&1; then
  echo "NOT PROVEN: the scratch database did not migrate. See $evidence/migrate.log" >&2
  exit 1
fi

{
  echo "commit: $(git rev-parse HEAD)"
  echo "dirty files: $(git status --porcelain | wc -l | tr -d ' ')"
  echo "command: ${drive[*]}"
  echo "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$evidence/drive.txt"

(
  "${drive[@]}" 2>&1 | tee "$evidence/terminal.log"
  exit "${PIPESTATUS[0]}"
) &
drive_pid=$!
wait "$drive_pid"
drive_exit=$?
# A trapped signal ends the wait early. The run then needs a moment to stop.
if [ "$drive_exit" -gt 128 ] && kill -0 "$drive_pid" 2>/dev/null; then
  wait "$drive_pid"
  drive_exit=$?
fi
echo "exit code: $drive_exit" >>"$evidence/drive.txt"

run_id=$(grep -o '"runId":"[^"]*"' "$evidence/terminal.log" | tail -1 | cut -d'"' -f4)
if [ -z "$run_id" ]; then
  echo "NOT PROVEN: the drive printed no run id (exit code $drive_exit). Evidence: $evidence" >&2
  exit 1
fi

pnpm -s runs show "$run_id" --json >"$evidence/run.json" 2>/dev/null
pnpm -s runs show "$run_id" --all >"$evidence/run.txt" 2>/dev/null
pnpm -s runs show "$run_id" --report >"$evidence/report.md" 2>/dev/null

# shellcheck disable=SC2086
pnpm -s verify:run "$run_id" --self-test --timing --db "$db" $audit_flags >"$evidence/audit.txt" 2>&1
audit_exit=$?
[ -f "$root/.verify/$run_id/audit.json" ] && audited=yes
if [ -f "$root/.verify/$run_id/audit.json" ]; then
  mv "$root/.verify/$run_id/audit.json" "$evidence/audit.json"
  rmdir "$root/.verify/$run_id" 2>/dev/null
fi

echo
tail -1 "$evidence/audit.txt"
echo "Run $run_id: drive exit code $drive_exit, audit exit code $audit_exit."
echo "Evidence: $evidence"
[ "$drive_exit" -eq 0 ] && [ "$audit_exit" -eq 0 ]
