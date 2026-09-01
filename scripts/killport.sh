#!/usr/bin/env bash
# Process cleanup that doesn't shoot itself in the foot.
#
# Two rules learned the hard way (MISTAKES.md #1 and #6):
#   1. Never match a process by name pattern — `pkill -f "vite preview"` matches
#      the shell running that very command and kills the whole chain (exit 144).
#   2. Killing a spawned wrapper is not killing the server. Kill the group.
#
# Usage:
#   scripts/killport.sh 5173 4178      kill whatever listens on those ports
#   scripts/killport.sh --orphans      fail if this project left a server up
set -uo pipefail

# Ports the smoke harness spawns servers on. `--orphans` asserts these are clear
# once a run is over. The dev server (5173) is deliberately long-lived and a
# human may be using it, so it is NOT policed here — kill it explicitly.
SMOKE_PORTS=(4178 4179 4180 4181 4182 4183)

listener_on() {
  ss -lptn "sport = :$1" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1
}

if [ "${1:-}" = "--orphans" ]; then
  leaked=()
  for port in "${SMOKE_PORTS[@]}"; do
    pid=$(listener_on "$port")
    [ -n "$pid" ] && leaked+=("  :${port} held by pid ${pid} ($(ps -p "$pid" -o comm= 2>/dev/null))")
  done

  if [ ${#leaked[@]} -gt 0 ]; then
    echo "orphaned servers still listening:" >&2
    printf '%s\n' "${leaked[@]}" >&2
    echo "these are bound to all interfaces — run scripts/killport.sh ${SMOKE_PORTS[*]}" >&2
    exit 1
  fi
  echo "no orphaned smoke servers"
  exit 0
fi

if [ $# -eq 0 ]; then
  echo "usage: killport.sh <port>... | --orphans" >&2
  exit 2
fi

for port in "$@"; do
  pid=$(listener_on "$port")
  if [ -n "$pid" ]; then
    # Negated pid targets the process group, so children die with the parent.
    kill -- "-$(ps -o pgid= "$pid" | tr -d ' ')" 2>/dev/null || kill "$pid" 2>/dev/null
    echo "killed ${pid} on :${port}"
  else
    echo ":${port} free"
  fi
done
