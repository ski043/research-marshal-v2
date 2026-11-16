#!/usr/bin/env bash
# Shared by prove.sh and cancel-run.sh. Source it, do not run it.

# Prints every descendant PID of $1.
descendants() {
  local child
  for child in $(pgrep -P "$1"); do
    echo "$child"
    descendants "$child"
  done
}

# Prints the node processes below $1. pnpm and a shell sit above a run, and
# only the node process handles SIGINT.
nodes_below() {
  local pid
  for pid in $(descendants "$1"); do
    [ "$(basename "$(ps -o comm= -p "$pid" 2>/dev/null)")" = node ] && echo "$pid"
  done
}

# Creates .verify/<slug>-<UTC time>-<random>/ and prints its path. The random
# part keeps two proofs with one slug in the same second apart.
new_evidence_dir() {
  local root=$1 slug=$2
  mkdir -p "$root/.verify" || return 1
  mktemp -d "$root/.verify/$slug-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX"
}

# Prints the node processes below $1 that have no node process below them.
# pnpm is a node process too. The run is the innermost one.
leaf_nodes_below() {
  local pid
  for pid in $(nodes_below "$1"); do
    [ -z "$(nodes_below "$pid")" ] && echo "$pid"
  done
}

# Interrupts the runs that this helper started, the way Ctrl-C does. Each run
# gets one signal. A second one would make it quit before it stores its cancel.
interrupt_runs() {
  local pid
  for pid in $(leaf_nodes_below $$); do
    kill -INT "$pid" 2>/dev/null
  done
}
