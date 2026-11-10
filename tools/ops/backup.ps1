# SPDX-FileCopyrightText: 2026 Bamboo
# SPDX-License-Identifier: Apache-2.0
param(
    [string]$Out = (Join-Path "backups" (Get-Date -Format "yyyyMMdd-HHmmss")),
    [string]$Project = $(if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { "bamboo" })
)
$ErrorActionPreference = "Stop"

function Invoke-Docker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "docker $($args -join ' ') thất bại ($LASTEXITCODE)" }
}

New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Out = (Resolve-Path $Out).Path

Write-Host "==> CSDL (pg_dumpall)"
Invoke-Docker compose -p $Project exec -T db sh -c 'pg_dumpall -U "${POSTGRES_USER:-bms}" -f /tmp/bamboo-backup.sql'
Invoke-Docker compose -p $Project cp db:/tmp/bamboo-backup.sql (Join-Path $Out "postgres.sql")
Invoke-Docker compose -p $Project exec -T db rm -f /tmp/bamboo-backup.sql

Write-Host "==> Volume (tạm dừng OpenBao, SeaweedFS trong lúc chép)"
Invoke-Docker compose -p $Project pause openbao seaweedfs
try {
    foreach ($vol in "openbao-data", "openbao-keys", "seaweedfs-data") {
        Invoke-Docker run --rm -v "${Project}_${vol}:/v:ro" -v "${Out}:/backup" alpine:3.22 `
            tar czf "/backup/$vol.tgz" -C /v .
    }
} finally {
    & docker compose -p $Project unpause openbao seaweedfs | Out-Null
}

Get-ChildItem $Out | Format-Table Name, Length
Write-Host "Đã sao lưu vào $Out (chứa khóa két: cất giữ an toàn)."
