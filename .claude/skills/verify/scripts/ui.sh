#!/usr/bin/env bash
# Serves the web UI on the offline fakes with a scratch database that holds one run of
# each scenario and one cancelled run. It runs until it gets SIGTERM or Ctrl-C, then
# stops the server that it started and removes the scratch database.
set -u

usage() {
  cat >&2 <<'USAGE'
Usage:
  ui.sh <slug> [--port <n>] [--pace <ms>] [--prod]

  --port   The port of the app. Default 3210.
  --pace   The pace of the fakes for runs started in the browser. Default 150.
  --prod   Build the app and serve the production build. Default: the development server.

It sends no paid request. Evidence goes to .verify/<slug>-<UTC time>-<random>/.
Stop it with SIGTERM or Ctrl-C.
USAGE
  exit 2
}

[ $# -ge 1 ] || usage
slug=$1
shift
port=3210
pace=150
mode=dev
while [ $# -gt 0 ]; do
  case "$1" in
    --port) port=${2:-}; shift 2 ;;
    --pace) pace=${2:-}; shift 2 ;;
    --prod) mode=prod; shift ;;
    *) usage ;;
  esac
done
case "$port$pace" in *[!0-9]* | "") usage ;; esac

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
# shellcheck source=lib.sh
. "$root/.claude/skills/verify/scripts/lib.sh"

if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "NOT STARTED: port $port is in use. Pass --port <n>." >&2
  exit 1
fi
if ! node scripts/doctor.mjs >/dev/null 2>&1; then
  node scripts/doctor.mjs
  echo "NOT STARTED: the worktree is not ready. Run pnpm bootstrap." >&2
  exit 1
fi

evidence=$(new_evidence_dir "$root" "$slug") || exit 1
db="$evidence/ui.db"
server=""
stop() {
  if [ -n "$server" ]; then
    # pnpm does not pass a signal on, so each process below it gets its own.
    local pids
    pids="$(descendants "$server") $server"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null
    wait "$server" 2>/dev/null
  fi
  rm -f "$db" "$db-journal" "$db-wal" "$db-shm"
  echo "Stopped. Evidence: $evidence"
}
trap stop EXIT
trap 'exit 0' TERM INT

export DATABASE_URL="file:$db"
pnpm -s db:migrate >"$evidence/migrate.log" 2>&1 || {
  echo "NOT STARTED: the scratch database did not migrate. See $evidence/migrate.log" >&2
  exit 1
}

for scenario in completed failures dropped budget no-claims; do
  pnpm -s research:offline "$scenario" --json >>"$evidence/seed.log" 2>&1 || {
    echo "NOT STARTED: the scenario $scenario did not run. See $evidence/seed.log" >&2
    exit 1
  }
done
# One cancelled run for the history: a paced run, interrupted the way Ctrl-C does.
pnpm -s research:offline budget --pace 400 --json >>"$evidence/seed.log" 2>&1 &
seed=$!
sleep 3 &
wait $!
leaf=$(leaf_nodes_below "$seed" | tail -1)
[ -n "$leaf" ] && kill -INT "$leaf"
wait "$seed"

export RESEARCH_MARSHAL_FAKES=$pace
if [ "$mode" = prod ]; then
  pnpm -s build >"$evidence/build.log" 2>&1 || {
    echo "NOT STARTED: the build failed. See $evidence/build.log" >&2
    exit 1
  }
  pnpm -s start -p "$port" >"$evidence/server.log" 2>&1 &
else
  pnpm -s dev -p "$port" >"$evidence/server.log" 2>&1 &
fi
server=$!

url="http://127.0.0.1:$port"
for _ in $(seq 1 120); do
  curl -fsS -o /dev/null "$url/" 2>/dev/null && break
  if ! kill -0 "$server" 2>/dev/null; then
    echo "NOT STARTED: the server stopped. See $evidence/server.log" >&2
    exit 1
  fi
  sleep 0.5 &
  wait $!
done

{
  echo "commit: $(git rev-parse HEAD)"
  echo "dirty files: $(git status --porcelain | wc -l | tr -d ' ')"
  echo "server: $mode, port $port, fakes at ${pace} ms"
  echo "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$evidence/drive.txt"

echo "URL: $url"
echo "Evidence: $evidence"
echo "READY: the web UI runs on the offline fakes. Stop with SIGTERM or Ctrl-C."
wait "$server"
