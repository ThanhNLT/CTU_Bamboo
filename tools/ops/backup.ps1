# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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
