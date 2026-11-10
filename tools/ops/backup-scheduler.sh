#!/usr/bin/env bash
# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
interval="$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))"
sleep "${BACKUP_FIRST_DELAY:-300}"
while true; do
    if dir="$("$here/backup-db.sh")"; then
        "$here/restore-drill.sh" "$(echo "$dir" | tail -n1)" || echo "Diễn tập khôi phục thất bại: xem audit.backup_run" >&2
    fi
    sleep "$interval"
done
