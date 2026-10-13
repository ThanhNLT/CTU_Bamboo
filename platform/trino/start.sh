#!/bin/bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Nạp khóa ký giao tiếp nội bộ (openbao-init ghi) vào biến môi trường mà config.properties đọc, rồi chạy Trino.
set -euo pipefail
TRINO_SHARED_SECRET="$(cat /etc/trino/secrets/shared-secret)"
export TRINO_SHARED_SECRET
exec /usr/lib/trino/bin/run-trino "$@"
