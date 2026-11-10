#!/usr/bin/env bash
# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

set -uo pipefail

REPO="${REPO_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
BRANCH="${GITOPS_BRANCH:-main}"
STATE_FILE="${STATE_FILE:-$REPO/.gitops-state.json}"
PROJECT="${COMPOSE_PROJECT_NAME:-bamboo}"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

cd "$REPO" || exit 2
log() { echo "$(date -u +%FT%TZ) $*"; }
dc() { docker compose -p "$PROJECT" "$@"; }

write_state() {
    printf '{"at": "%s", "status": "%s", "commit": "%s", "config_hash": "%s", "note": "%s"}\n' \
        "$(date -u +%FT%TZ)" "$1" "$(git rev-parse --short HEAD 2> /dev/null)" "${state_hash:-}" "${2//\"/\'}" > "$STATE_FILE"
}

previous_hash=""
[ -f "$STATE_FILE" ] && previous_hash="$(sed -n 's/.*"config_hash": "\([^"]*\)".*/\1/p' "$STATE_FILE")"
state_hash="$previous_hash" # mã băm cấu hình đã áp dụng thành công; lỗi thì giữ nguyên để lần sau thử lại

if ! git fetch --quiet origin "$BRANCH"; then
    write_state error "git fetch thất bại"
    log "git fetch thất bại"
    exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH")" ]; then
    if git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
        log "kéo cập nhật từ origin/$BRANCH"
        [ "$DRY" = 1 ] || git merge --ff-only --quiet "origin/$BRANCH" || { write_state error "không fast-forward được"; exit 1; }
    else
        write_state error "lịch sử origin/$BRANCH không phải kế thừa của bản đang chạy"
        log "dừng: lịch sử bị viết lại hoặc có thay đổi cục bộ chưa đẩy"
        exit 1
    fi
fi

cfg_hash="$(dc config --hash '*' 2> /dev/null | sort | sha256sum | cut -c1-16)"
if [ -z "$cfg_hash" ]; then
    write_state error "docker compose config lỗi"
    log "cấu hình compose không hợp lệ"
    exit 1
fi

drift=""
while read -r service state health; do
    [ -n "$service" ] || continue
    if [ "$state" != "running" ] || { [ -n "$health" ] && [ "$health" != "healthy" ]; }; then
        drift="$drift $service($state${health:+/$health})"
    fi
done < <(dc ps --format '{{.Service}} {{.State}} {{.Health}}' 2> /dev/null)

if [ "$cfg_hash" != "$previous_hash" ] || [ -n "$drift" ]; then
    reason="cấu hình đổi"
    [ "$cfg_hash" = "$previous_hash" ] && reason="dịch vụ lệch:${drift}"
    log "áp dụng ($reason)"
    if [ "$DRY" = 1 ]; then
        log "dry-run: sẽ chạy docker compose up -d --remove-orphans"
        exit 0
    fi
    if dc up -d --remove-orphans; then
        state_hash="$cfg_hash"
        write_state applied "$reason"
    else
        write_state error "docker compose up thất bại ($reason)"
        exit 1
    fi
else
    state_hash="$cfg_hash"
    write_state in-sync "không có thay đổi"
    log "đã khớp cấu hình trong Git"
fi
