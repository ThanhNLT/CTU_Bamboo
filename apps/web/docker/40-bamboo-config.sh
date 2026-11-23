#!/bin/sh
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
