#!/bin/bash
# Run on the Pi from cron every couple of minutes. If a new image was published to GHCR (or the repo
# changed), backs up the database, restarts the app on the new image and rolls back if it isn't healthy.
# After a healthy update it emails you through Resend if RESEND_API_KEY and NOTIFY_EMAIL are set
# (environment or .env, the same variables the app uses for signup alerts).
set -euo pipefail

IMAGE=ghcr.io/joeattardi/gamequeue:latest

# env_value NAME: the environment first, then NAME= in .env (read by name; the file holds other secrets)
env_value() {
    local v=${!1:-}
    [ -n "$v" ] || v=$(sed -n "s/^$1=//p" .env 2>/dev/null | head -n1 | tr -d '"'"'"'\r' || true)
    printf '%s' "$v"
}

# json_string TEXT: TEXT as a quoted JSON string (no jq on a stock Pi)
json_string() {
    printf '%s' "$1" | awk 'BEGIN { ORS = ""; printf "\"" }
        { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); gsub(/\t/, "\\t"); gsub(/\r/, ""); if (NR > 1) printf "\\n"; printf "%s", $0 }
        END { printf "\"" }'
}

# notify_deployed OLD_HEAD NEW_HEAD: best-effort "deployed" email; never fails the update
notify_deployed() {
    local key to from changes body
    key=$(env_value RESEND_API_KEY)
    to=$(env_value NOTIFY_EMAIL)
    from=$(env_value NOTIFY_FROM)
    [ -n "$key" ] && [ -n "$to" ] || return 0
    [ -n "$from" ] || from='GameQueue <onboarding@resend.dev>'
    if [ "$1" = "$2" ]; then
        changes='No new commits (the image or compose config changed).'
    else
        changes=$(git log --format='- %s (%h)' "$1..$2" | head -n 20)
    fi
    body="GameQueue is running $(git rev-parse --short "$2") on $(hostname).

$changes"
    curl -fsS -m 15 -o /dev/null https://api.resend.com/emails \
        -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
        -d "{\"from\":$(json_string "$from"),\"to\":[$(json_string "$to")],\"subject\":\"GameQueue deployed\",\"text\":$(json_string "$body")}" ||
        echo "$(date '+%F %T') deploy email failed" >&2
}

main() {
    cd "$(dirname "$0")/.."
    exec 9>.update.lock
    flock -n 9 || exit 0

    head_before=$(git rev-parse HEAD)
    git pull --ff-only -q
    head_after=$(git rev-parse HEAD)

    image_before=$(docker image inspect -f '{{.Id}}' "$IMAGE" 2>/dev/null || true)
    docker compose pull -q gamequeue
    image_after=$(docker image inspect -f '{{.Id}}' "$IMAGE")

    if [ "$head_before" = "$head_after" ] && [ "$image_before" = "$image_after" ]; then
        exit 0
    fi

    echo "$(date '+%F %T') updating: repo $head_before -> $head_after, image $image_before -> $image_after"
    [ -f data/gamequeue.db ] && ./scripts/backup.sh
    [ -n "$image_before" ] && docker tag "$image_before" gamequeue:previous
    docker compose up -d --no-build --remove-orphans

    for _ in $(seq 1 30); do
        status=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q gamequeue)" 2>/dev/null || true)
        if [ "$status" = healthy ]; then
            echo "$(date '+%F %T') update ok"
            notify_deployed "$head_before" "$head_after" || true
            docker image prune -f >/dev/null
            exit 0
        fi
        sleep 2
    done

    echo "$(date '+%F %T') new version not healthy" >&2
    if [ -n "$image_before" ]; then
        echo "rolling back to the previous image; if a migration ran, restore the backup (DEPLOYMENT.md)" >&2
        docker tag "$image_before" "$IMAGE"
        docker compose up -d --no-build
    fi
    exit 1
}

# main + exit on one line: bash has read the whole function before running it, so a git pull
# that rewrites this file mid-run can't corrupt the execution
main "$@"; exit $?
