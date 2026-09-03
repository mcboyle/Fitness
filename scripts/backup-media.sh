#!/usr/bin/env bash
# Copies the photo store, the archive, and the database snapshots.
#
# Progress photos are the only thing in this app nobody can retake, and
# snapshot.sh does not cover them — it copies the database, so the media rows
# survive a bad migration while the files do not survive a lost disk.
#
# It also fixes a real hazard: data/snapshots lives *inside* data/, so
# `rm -rf data` during a reset destroys the backups along with the thing they
# were backing up. This puts a copy outside that directory.
#
#   MEDIA_BACKUP_DEST   where to put it. A local path, or anything rsync
#                       understands: user@host:/path, or a mounted volume.
#                       Defaults to ~/fitness-media-backup — outside data/, but
#                       still the same disk, which is NOT disaster recovery.
#
# Deletions propagate on purpose (--delete). A photo purged after its thirty
# days must not survive in the backup, or the retention promise is a lie. This
# protects against losing the disk or wiping the directory; it is deliberately
# not a way around retention.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
DEST="${MEDIA_BACKUP_DEST:-$HOME/fitness-media-backup}"

[ -d "$DATA_DIR" ] || { echo "no data directory at $DATA_DIR"; exit 0; }

# Only create the destination when it is local; a remote one is rsync's problem.
case "$DEST" in
  *:*) ;;
  *) mkdir -p "$DEST" ;;
esac

copied=0
for dir in media trash snapshots; do
  src="$DATA_DIR/$dir"
  [ -d "$src" ] || continue
  rsync -a --delete "$src/" "$DEST/$dir/"
  n=$(find "$src" -type f 2>/dev/null | wc -l)
  echo "  $dir: $n files -> $DEST/$dir/"
  copied=$((copied + n))
done

if [ "$copied" -eq 0 ]; then
  echo "  nothing to copy yet"
fi

case "$DEST" in
  *:*) echo "  destination is remote — off-box copy in place" ;;
  "$HOME"/*)
    if [ "$(findmnt -no SOURCE -T "$DEST" 2>/dev/null)" = "$(findmnt -no SOURCE -T "$DATA_DIR" 2>/dev/null)" ]; then
      echo "  WARNING: destination is on the same filesystem as the data."
      echo "  This survives 'rm -rf data' but NOT a disk failure."
      echo "  Set MEDIA_BACKUP_DEST to another machine or volume."
    fi
    ;;
esac
