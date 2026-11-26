#!/usr/bin/env bash
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

# mTLS cho các chặng HTTP nội bộ (infra/compose/mtls.yml, ADR #76).
#
#   tools/mtls.sh compose-file   in COMPOSE_FILE kèm infra/compose/mtls.yml khi cần bật, không in gì khi không bật
#
# Bật khi BAMBOO_MTLS=true, hoặc BAMBOO_ENV=production và BAMBOO_MTLS không đặt là false (biến môi trường trước, rồi
# .env). Makefile dùng kết quả cho mọi lệnh docker compose.

set -euo pipefail
cd "$(dirname "$0")/.."

# Như tools/mac/ai.sh: .env sửa bằng Notepad có CRLF, hoặc giá trị đặt trong nháy.
env_value() { [ -f .env ] && sed -n "s/^[[:space:]]*$1=//p" .env | tail -n1 | tr -d '\r' | sed "s/^[[:space:]]*['\"]\{0,1\}//; s/['\"]\{0,1\}[[:space:]]*\$//" || true; }
setting() { local v="${!1:-}"; [ -n "$v" ] || v=$(env_value "$1"); echo "${v:-$2}"; }

enabled() {
    local mtls
    mtls=$(setting BAMBOO_MTLS "")
    [ "$mtls" = true ] || { [ "$(setting BAMBOO_ENV development)" = production ] && [ "$mtls" != false ]; }
}

case "${1:-}" in
    compose-file)
        enabled || exit 0
        files=$(setting COMPOSE_FILE compose.yaml)
        case ":$files:" in *:infra/compose/mtls.yml:*) ;; *) files="$files:infra/compose/mtls.yml" ;; esac
        echo "$files"
        ;;
    *)
        echo "Dùng: tools/mtls.sh compose-file" >&2
        exit 2
        ;;
esac
