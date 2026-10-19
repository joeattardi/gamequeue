#!/bin/bash
# Snapshots the live SQLite database (safe while the app runs), keeps 14 days, copies off-machine if
# an rclone remote named "offsite" exists. Run nightly from cron; update.sh also runs it before updates.
set -euo pipefail

DIR=${GQ_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
DB="$DIR/data/gamequeue.db"
OUT="$DIR/backups"
STAMP=$(date +%F-%H%M%S)
FILE="$OUT/gamequeue-$STAMP.db"

mkdir -p "$OUT"
sqlite3 "$DB" ".backup '$FILE'"

# refuse to keep (or upload) a damaged snapshot
if [ "$(sqlite3 "$FILE" 'PRAGMA integrity_check;')" != "ok" ]; then
    echo "integrity check failed for $FILE" >&2
    rm -f "$FILE"
    exit 1
fi

gzip -f "$FILE"
find "$OUT" -name 'gamequeue-*.db.gz' -mtime +14 -delete

if command -v rclone >/dev/null && rclone listremotes | grep -q '^offsite:'; then
    rclone copy "$FILE.gz" offsite:gamequeue-backups/
fi
