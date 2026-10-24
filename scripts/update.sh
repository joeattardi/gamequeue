#!/bin/bash
# Run on the Pi from cron every couple of minutes. If a new image was published to GHCR (or the repo
# changed), backs up the database, restarts the app on the new image and rolls back if it isn't healthy.
# After a healthy update, or a failed one that was rolled back, it emails you through Resend if
# RESEND_API_KEY and NOTIFY_EMAIL are set (environment or .env, the same variables the app uses for signup alerts).
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

# send_email SUBJECT BODY: best-effort email through Resend; never fails the update
send_email() {
    local key to from
    key=$(env_value RESEND_API_KEY)
    to=$(env_value NOTIFY_EMAIL)
    from=$(env_value NOTIFY_FROM)
    [ -n "$key" ] && [ -n "$to" ] || return 0
    [ -n "$from" ] || from='GameQueue <onboarding@resend.dev>'
    curl -fsS -m 15 -o /dev/null https://api.resend.com/emails \
        -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
        -d "{\"from\":$(json_string "$from"),\"to\":[$(json_string "$to")],\"subject\":$(json_string "$1"),\"text\":$(json_string "$2")}" ||
        echo "$(date '+%F %T') update email failed" >&2
    return 0
}

# commit_summary OLD_HEAD NEW_HEAD: the commit subjects in the update, or a note when there are none
commit_summary() {
    if [ "$1" = "$2" ]; then
        echo 'No new commits (the image or compose config changed).'
    else
        git log --format='- %s (%h)' "$1..$2" | head -n 20
    fi
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
            send_email "GameQueue deployed" "GameQueue is running $(git rev-parse --short "$head_after") on $(hostname).

$(commit_summary "$head_before" "$head_after")"
            docker image prune -f >/dev/null
            exit 0
        fi
        sleep 2
    done

    echo "$(date '+%F %T') new version not healthy" >&2
    # grab the logs first: rolling back recreates the container
    logs=$(docker compose logs --tail 20 --no-color gamequeue 2>&1 || true)
    outcome='No previous image to roll back to; the app may be down.'
    if [ -n "$image_before" ]; then
        echo "rolling back to the previous image; if a migration ran, restore the backup (DEPLOYMENT.md)" >&2
        docker tag "$image_before" "$IMAGE"
        docker compose up -d --no-build
        outcome='Rolled back to the previous image. If a migration ran, restore the pre-update backup (DEPLOYMENT.md).'
    fi
    send_email "GameQueue deploy FAILED" "The update to $(git rev-parse --short "$head_after") was not healthy after a minute on $(hostname).
$outcome

$(commit_summary "$head_before" "$head_after")

Last container logs:
$logs"
    exit 1
}

# main + exit on one line: bash has read the whole function before running it, so a git pull
# that rewrites this file mid-run can't corrupt the execution
main "$@"; exit $?
