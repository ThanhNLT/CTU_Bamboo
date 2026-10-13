#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
#
# Sinh /config.js từ biến môi trường lúc container khởi động (cấu hình lúc chạy của ứng dụng):
#   BAMBOO_KEYCLOAK_URL, BAMBOO_KEYCLOAK_REALM, BAMBOO_KEYCLOAK_CLIENT, BAMBOO_HASURA_URL
# Biến không đặt thì ứng dụng dùng giá trị gắn lúc build. nginx phục vụ tệp ở /config.js.
# Công cụ: POSIX sh

# ===== Thiết lập =====
set -eu
out=/tmp/bamboo/config.js
mkdir -p "$(dirname "$out")"

# ===== Hàm =====
entry() {
    # Chỉ nhận giá trị an toàn cho chuỗi JS (URL, mã realm/client).
    case "$2" in
        *[\"\\\'\<\>]*)
            echo "40-bamboo-config: bỏ qua $1 vì chứa ký tự không hợp lệ" >&2
            return
            ;;
    esac
    [ -n "$2" ] && printf '  "%s": "%s",\n' "$1" "$2"
    return 0
}

# ===== Sinh /config.js =====
{
    echo "window.__BAMBOO_CONFIG__ = {"
    entry keycloakUrl "${BAMBOO_KEYCLOAK_URL:-}"
    entry keycloakRealm "${BAMBOO_KEYCLOAK_REALM:-}"
    entry keycloakClient "${BAMBOO_KEYCLOAK_CLIENT:-}"
    entry hasuraUrl "${BAMBOO_HASURA_URL:-}"
    echo "};"
} > "$out"
echo "40-bamboo-config: đã ghi $out"
