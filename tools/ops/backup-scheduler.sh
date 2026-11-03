#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
#
# Vòng lặp sao lưu theo lịch trong container `backup`: sau BACKUP_FIRST_DELAY giây chạy lần đầu, rồi mỗi
# BACKUP_INTERVAL_HOURS giờ sao lưu CSDL và diễn tập khôi phục ngay bản vừa tạo.
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
