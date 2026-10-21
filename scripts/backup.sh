#!/bin/bash
# Snapshots the live SQLite database (safe while the app runs), keeps 14 days, copies off-machine if
# an rclone remote named "offsite" exists. Run nightly from cron; update.sh also runs it before updates.
# Every run leaves data/backup-status.json behind for the admin page (success or failure).
set -euo pipefail

DIR=${GQ_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
DB="$DIR/data/gamequeue.db"
OUT="$DIR/backups"
STATUS="$DIR/data/backup-status.json"
STAMP=$(date +%F-%H%M%S)
FILE="$OUT/gamequeue-$STAMP.db"

FAILED_CMD=""
OFFSITE="not-configured"
SIZE="null"
NAME="null"

# last fully successful run, carried over so a failed run doesn't erase it
LAST_SUCCESS=$(sed -n 's/.*"lastSuccessAt": *\([0-9]\{1,\}\).*/\1/p' "$STATUS" 2>/dev/null | head -n1 || true)
LAST_SUCCESS=${LAST_SUCCESS:-null}

# write_status <ok true|false> <error text or empty>; atomic so the app never reads half a file
write_status() {
    local now ok=$1 err=$2 success=$LAST_SUCCESS errjson=null
    now=$(date +%s)000
    [ "$ok" = true ] && success=$now
    # keep the message JSON-safe: no quotes, backslashes or control characters
    [ -n "$err" ] && errjson="\"$(printf '%s' "$err" | tr -d '"\\' | tr -c '[:print:]' ' ' | cut -c1-300)\""
    printf '{"lastRunAt":%s,"ok":%s,"error":%s,"lastSuccessAt":%s,"file":%s,"sizeBytes":%s,"offsite":"%s"}\n' \
        "$now" "$ok" "$errjson" "$success" "$NAME" "$SIZE" "$OFFSITE" >"$STATUS.tmp" &&
        mv "$STATUS.tmp" "$STATUS" || true
}

trap 'FAILED_CMD=$BASH_COMMAND' ERR
trap 'rc=$?; [ $rc -eq 0 ] || write_status false "backup failed (exit $rc): $FAILED_CMD"' EXIT

mkdir -p "$OUT"
sqlite3 "$DB" ".backup '$FILE'"

# refuse to keep (or upload) a damaged snapshot
if [ "$(sqlite3 "$FILE" 'PRAGMA integrity_check;')" != "ok" ]; then
    echo "integrity check failed for $FILE" >&2
    rm -f "$FILE"
    FAILED_CMD="integrity check of the snapshot"
    exit 1
fi

gzip -f "$FILE"
NAME="\"$(basename "$FILE.gz")\""
SIZE=$(wc -c <"$FILE.gz" | tr -d ' ')
find "$OUT" -name 'gamequeue-*.db.gz' -mtime +14 -delete

if command -v rclone >/dev/null && rclone listremotes | grep -q '^offsite:'; then
    if rclone copy "$FILE.gz" offsite:gamequeue-backups/; then
        OFFSITE="uploaded"
    else
        OFFSITE="failed"
        FAILED_CMD="upload to the offsite remote"
        exit 1
    fi
fi

write_status true ""
