#!/usr/bin/env bash
# Timestamped local snapshot of the SQLite database.
#
# NOT a backup in the sense BUILDSPEC §12 asks for. This protects against a bad
# migration or an accidental delete; it does NOT protect against losing the
# disk, because the copies sit on the same disk. Off-box Litestream is still
# outstanding — see README.
#
# Uses sqlite3's own backup API via better-sqlite3 rather than cp, because the
# database runs in WAL mode and copying the file alone can capture a torn state.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
DB="$DATA_DIR/lifestyle.db"
OUT="${SNAPSHOT_DIR:-$DATA_DIR/snapshots}"
KEEP="${KEEP:-48}"

[ -f "$DB" ] || { echo "no database at $DB — nothing to snapshot"; exit 0; }
mkdir -p "$OUT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$OUT/lifestyle-$STAMP.db"

node -e "
const Database = require('$ROOT/node_modules/better-sqlite3');
const db = new Database('$DB', { readonly: true });
db.backup('$DEST').then(() => { db.close(); }).catch(e => { console.error(e); process.exit(1); });
"

gzip -f "$DEST"
echo "snapshot: ${DEST}.gz ($(du -h "${DEST}.gz" | cut -f1))"

# Keep the most recent N, drop the rest.
ls -1t "$OUT"/lifestyle-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"
  echo "pruned: $old"
done
