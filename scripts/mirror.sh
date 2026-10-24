#!/bin/bash
# Rebuilds the local IGDB mirror from IGDB's daily data dumps (see IGDB_MIRROR.md). Run once a day from
# cron, shortly after 06:00 UTC when IGDB publishes the dump; when the dump hasn't changed it does
# nothing (a few seconds). Extra arguments go to the importer: scripts/mirror.sh --force
# The importer runs in a throw-away container from the app image that shares ./data with the app, so it
# neither competes with the web process nor needs the app to be up. It leaves data/mirror-status.json
# behind for the admin page (success or failure); a failed run also lands in the app's error log.
# If HEALTHCHECK_MIRROR_URL is set (environment or .env), also pings healthchecks.io: /start, then
# success or /fail with the last lines of output. Exits non-zero when the run failed.
set -uo pipefail

DIR=${GQ_DIR:-$(cd "$(dirname "$0")/.." && pwd)}

# env_value NAME: the environment first, then NAME= in .env (read by name; the file holds other secrets)
env_value() {
    local v=${!1:-}
    [ -n "$v" ] || v=$(sed -n "s/^$1=//p" "$DIR/.env" 2>/dev/null | head -n1 | tr -d '"'"'"'\r' || true)
    printf '%s' "$v"
}

URL=$(env_value HEALTHCHECK_MIRROR_URL)

# ping [suffix] [message]: never fails the job, so a monitoring outage can't break it
ping_healthcheck() {
    [ -n "$URL" ] || return 0
    curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "${2:-}" "$URL${1:-}" || true
}

cd "$DIR" || exit 1

# One run at a time (a manual run while cron fires); flock is missing on macOS, where it doesn't matter
if command -v flock >/dev/null; then
    exec 9>.mirror.lock
    flock -n 9 || {
        echo "$(date '+%F %T') mirror: already running"
        exit 0
    }
fi

echo "$(date '+%F %T') mirror: start"
ping_healthcheck /start

OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT
docker compose run --rm --no-deps -T gamequeue node dist/mirror/cli.js "$@" >"$OUT" 2>&1
rc=$?
cat "$OUT"

summary=$(tail -n 5 "$OUT")
if [ $rc -eq 0 ]; then
    echo "$(date '+%F %T') mirror: ok"
    ping_healthcheck "" "$(tail -n 1 "$OUT")"
else
    echo "$(date '+%F %T') mirror: FAILED (exit $rc)"
    ping_healthcheck /fail "${summary:-exit $rc}"
fi
exit $rc
