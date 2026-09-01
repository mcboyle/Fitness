#!/usr/bin/env bash
# Kill whatever is listening on a TCP port.
#
# Exists because `pkill -f "vite preview"` matches the shell running that very
# command and kills the whole chain (exit 144). Never pattern-match a process
# whose pattern appears in your own command line — match the port instead.
#
# Usage: scripts/killport.sh 5173 [4173 ...]
set -euo pipefail

for port in "$@"; do
  pid=$(ss -lptn "sport = :${port}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  if [ -n "${pid:-}" ]; then
    kill "$pid" && echo "killed ${pid} on :${port}"
  else
    echo ":${port} free"
  fi
done
