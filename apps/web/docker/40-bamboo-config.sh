#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0

set -eu
out=/tmp/bamboo/config.js
mkdir -p "$(dirname "$out")"

entry() {
    case "$2" in
        *[\"\\\'\<\>]*)
            echo "40-bamboo-config: bỏ qua $1 vì chứa ký tự không hợp lệ" >&2
            return
            ;;
    esac
    [ -n "$2" ] && printf '  "%s": "%s",\n' "$1" "$2"
    return 0
}

{
    echo "window.__BAMBOO_CONFIG__ = {"
    entry keycloakUrl "${BAMBOO_KEYCLOAK_URL:-}"
    entry keycloakRealm "${BAMBOO_KEYCLOAK_REALM:-}"
    entry keycloakClient "${BAMBOO_KEYCLOAK_CLIENT:-}"
    entry hasuraUrl "${BAMBOO_HASURA_URL:-}"
    entry setupUrl "${BAMBOO_SETUP_URL:-}"
    entry extUrl "${BAMBOO_EXT_URL:-}"
    echo "};"
} > "$out"
echo "40-bamboo-config: đã ghi $out"
