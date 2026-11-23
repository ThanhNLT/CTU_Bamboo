#!/usr/bin/env bash
# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
UNIT="bamboo-gitops"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
CRON_TAG="# bamboo-gitops"

env_value() { [ -f "$REPO/.env" ] && sed -n "s/^$1=//p" "$REPO/.env" | tail -n1 || true; }
setting() {
    local value="${!1:-}"
    [ -n "$value" ] || value="$(env_value "$1")"
    echo "${value:-${2:-}}"
}

INTERVAL="$(setting GITOPS_INTERVAL_MINUTES 5)"
BRANCH="$(setting GITOPS_BRANCH main)"

die() {
    echo "gitops: $*" >&2
    exit 1
}

has_systemd() { command -v systemctl > /dev/null 2>&1 && systemctl --user show-environment > /dev/null 2>&1; }
has_cron() { command -v crontab > /dev/null 2>&1; }
systemd_enabled() { has_systemd && systemctl --user is-enabled "$UNIT.timer" > /dev/null 2>&1; }
cron_enabled() { has_cron && crontab -l 2> /dev/null | grep -qF "$CRON_TAG"; }

check() {
    case "$INTERVAL" in
        "" | *[!0-9]*) die "GITOPS_INTERVAL_MINUTES phải là số nguyên từ 1 tới 59 (đang là '$INTERVAL')" ;;
    esac
    [ "$INTERVAL" -ge 1 ] && [ "$INTERVAL" -le 59 ] || die "GITOPS_INTERVAL_MINUTES phải từ 1 tới 59 (đang là '$INTERVAL')"
    git -C "$REPO" rev-parse --is-inside-work-tree > /dev/null 2>&1 \
        || die "$REPO không phải bản clone Git: GitOps cần kho Git làm nguồn cấu hình"
    git -C "$REPO" remote get-url origin > /dev/null 2>&1 || die "bản clone chưa có remote origin"
}

enable_systemd() {
    mkdir -p "$UNIT_DIR"
    cat > "$UNIT_DIR/$UNIT.service" << EOF
[Unit]
Description=Bamboo GitOps: đưa hệ thống về đúng cấu hình trong Git

[Service]
Type=oneshot
WorkingDirectory=$REPO
Environment=GITOPS_BRANCH=$BRANCH
ExecStart="$REPO/tools/gitops/reconcile.sh"
EOF
    cat > "$UNIT_DIR/$UNIT.timer" << EOF
[Unit]
Description=Bamboo GitOps: đối chiếu mỗi $INTERVAL phút

[Timer]
OnActiveSec=1min
OnBootSec=2min
OnUnitActiveSec=${INTERVAL}min
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "$UNIT.timer" > /dev/null
    loginctl enable-linger "$(id -un)" > /dev/null 2>&1 \
        || echo "gitops: không bật được linger; timer chỉ chạy khi $(id -un) đang đăng nhập (sudo loginctl enable-linger $(id -un))" >&2
}

enable_cron() {
    local line="*/$INTERVAL * * * * PATH=\"$PATH\" GITOPS_BRANCH=\"$BRANCH\" \"$REPO/tools/gitops/reconcile.sh\" >> \"$REPO/.gitops.log\" 2>&1 $CRON_TAG"
    write_cron "$line"
}

write_cron() {
    local others
    others="$(crontab -l 2> /dev/null | grep -vF "$CRON_TAG" || true)"
    {
        [ -z "$others" ] || echo "$others"
        [ -z "${1:-}" ] || echo "$1"
    } | crontab -
}

enable() {
    check
    if has_systemd; then
        enable_systemd
        echo "Đã bật GitOps: systemd timer $UNIT.timer đối chiếu với origin/$BRANCH mỗi $INTERVAL phút (xem: make gitops-status)"
    elif has_cron; then
        enable_cron
        echo "Đã bật GitOps: cron đối chiếu với origin/$BRANCH mỗi $INTERVAL phút, log ở $REPO/.gitops.log"
    else
        die "máy không có systemd (phiên người dùng) lẫn cron; tự lên lịch chạy $REPO/tools/gitops/reconcile.sh"
    fi
}

disable() {
    if has_systemd && [ -f "$UNIT_DIR/$UNIT.timer" ]; then
        systemctl --user disable --now "$UNIT.timer" > /dev/null 2>&1 || true
        rm -f "$UNIT_DIR/$UNIT.timer" "$UNIT_DIR/$UNIT.service"
        systemctl --user daemon-reload
    fi
    if cron_enabled; then
        write_cron ""
    fi
    echo "Đã tắt GitOps tự động"
}

status() {
    if systemd_enabled; then
        echo "GitOps: đang bật bằng systemd timer $UNIT.timer"
        systemctl --user list-timers "$UNIT.timer" --no-pager 2> /dev/null | sed -n '1,2p'
    elif cron_enabled; then
        echo "GitOps: đang bật bằng cron"
        crontab -l 2> /dev/null | grep -F "$CRON_TAG"
    else
        echo "GitOps: chưa bật (make gitops-enable)"
    fi
    if [ -f "$REPO/.gitops-state.json" ]; then
        echo "Lượt đối chiếu gần nhất: $(cat "$REPO/.gitops-state.json")"
    else
        echo "Chưa có lượt đối chiếu nào"
    fi
}

auto() {
    local mode flag current
    mode="$(setting BAMBOO_ENV development)"
    [ "$(echo "$mode" | tr '[:upper:]' '[:lower:]')" = production ] || return 0
    flag="$(setting BAMBOO_GITOPS true)"
    case "$(echo "$flag" | tr '[:upper:]' '[:lower:]')" in
        false | 0 | no | off) return 0 ;;
    esac
    if systemd_enabled || cron_enabled; then
        return 0
    fi
    current="$(git -C "$REPO" symbolic-ref --quiet --short HEAD 2> /dev/null || true)"
    if [ "$current" != "$BRANCH" ]; then
        echo "GitOps: bản đang chạy không ở nhánh $BRANCH nên không tự bật; bật tay bằng make gitops-enable" >&2
        return 0
    fi
    echo "BAMBOO_ENV=production: bật GitOps tự động (tắt bằng make gitops-disable hoặc BAMBOO_GITOPS=false)"
    (enable) || echo "GitOps: không bật tự động được, hệ thống vẫn chạy bình thường" >&2
}

case "${1:-status}" in
    enable) enable ;;
    disable) disable ;;
    status) status ;;
    auto) auto ;;
    *) die "cách dùng: schedule.sh enable|disable|status|auto" ;;
esac
