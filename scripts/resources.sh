#!/bin/bash
# Checks disk space, free memory and, on a Raspberry Pi, temperature and power. Run every 5 minutes from cron.
# Silent when everything is fine; prints one line per problem (cron appends it to resources.log).
# If HEALTHCHECK_RESOURCES_URL is set (environment or .env), pings healthchecks.io: a plain ping with the
# readings when all is well, /fail with the problems otherwise. A Pi that is down, or cron that stopped,
# shows up as missing pings.
# Thresholds (environment or .env): RESOURCE_DISK_MAX=85 (% used), RESOURCE_MEM_AVAILABLE_MIN=10 (% free),
# RESOURCE_TEMP_MAX=80 (°C). Checks that don't apply to the machine (no /proc, no Pi sensors) are skipped.
set -uo pipefail

DIR=${GQ_DIR:-$(cd "$(dirname "$0")/.." && pwd)}

# env_value NAME [default]: the environment first, then NAME= in .env (read by name; the file holds other secrets)
env_value() {
    local v=${!1:-}
    [ -n "$v" ] || v=$(sed -n "s/^$1=//p" "$DIR/.env" 2>/dev/null | head -n1 | tr -d '"'"'"'\r' || true)
    printf '%s' "${v:-${2:-}}"
}

URL=$(env_value HEALTHCHECK_RESOURCES_URL)
DISK_MAX=$(env_value RESOURCE_DISK_MAX 85)
MEM_MIN=$(env_value RESOURCE_MEM_AVAILABLE_MIN 10)
TEMP_MAX=$(env_value RESOURCE_TEMP_MAX 80)

problems=()
readings=()

# Data and backups live under $DIR; Docker's images and container logs are on / (often the same disk)
seen=""
for path in "$DIR" /; do
    line=$(df -P "$path" 2>/dev/null | awk 'NR==2 {gsub("%", "", $5); print $5, $6}') || continue
    [ -n "$line" ] || continue
    used=${line%% *}
    mount=${line#* }
    case " $seen " in *" $mount "*) continue ;; esac
    seen="$seen $mount"
    readings+=("disk $mount ${used}%")
    [ "$used" -ge "$DISK_MAX" ] && problems+=("disk $mount ${used}% full (limit ${DISK_MAX}%)")
done

if [ -r /proc/meminfo ]; then
    free_pct=$(awk '/^MemTotal:/ {t=$2} /^MemAvailable:/ {a=$2} END {if (t > 0) print int(a * 100 / t)}' /proc/meminfo)
    if [ -n "$free_pct" ]; then
        readings+=("memory ${free_pct}% available")
        [ "$free_pct" -lt "$MEM_MIN" ] && problems+=("memory ${free_pct}% available (minimum ${MEM_MIN}%)")
    fi
fi

if [ -r /sys/class/thermal/thermal_zone0/temp ]; then
    temp=$(($(cat /sys/class/thermal/thermal_zone0/temp) / 1000))
    readings+=("temp ${temp}C")
    [ "$temp" -ge "$TEMP_MAX" ] && problems+=("temperature ${temp}C (limit ${TEMP_MAX}C)")
fi

# Pi firmware flags. Only the "right now" bits: the "has happened since boot" bits would stay red until a reboot.
if command -v vcgencmd >/dev/null 2>&1; then
    flags=$(vcgencmd get_throttled 2>/dev/null | sed -n 's/^throttled=//p')
    if [ -n "$flags" ]; then
        now=$((flags & 0xF))
        [ $((now & 0x1)) -ne 0 ] && problems+=("under-voltage right now (check the power supply)")
        [ $((now & 0x2)) -ne 0 ] && problems+=("ARM frequency capped right now")
        [ $((now & 0x4)) -ne 0 ] && problems+=("CPU throttled right now")
        [ $((now & 0x8)) -ne 0 ] && problems+=("soft temperature limit active right now")
    fi
fi

# ping [suffix] [message]: a monitoring outage must not matter, so errors are ignored
ping_healthcheck() {
    [ -n "$URL" ] || return 0
    curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "${2:-}" "$URL${1:-}" || true
}

join() {
    local IFS=';'
    printf '%s' "$*" | sed 's/;/; /g'
}

if [ ${#problems[@]} -gt 0 ]; then
    msg=$(join "${problems[@]}")
    echo "$(date '+%F %T') PROBLEM: $msg"
    ping_healthcheck /fail "$msg"
    exit 1
fi
ping_healthcheck "" "$(join "${readings[@]}")"
