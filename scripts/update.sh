#!/bin/bash
# Run on the Pi from cron every couple of minutes. If a new image was published to GHCR (or the repo
# changed), backs up the database, restarts the app on the new image and rolls back if it isn't healthy.
set -euo pipefail

IMAGE=ghcr.io/joeattardi/gamequeue:latest

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
