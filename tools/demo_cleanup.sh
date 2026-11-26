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

set -euo pipefail
cd "$(dirname "$0")/.."

mode=ROLLBACK
case "${1:-}" in
    --apply) mode=COMMIT ;;
    "") ;;
    *) echo "Cách dùng: $0 [--apply]" >&2; exit 2 ;;
esac

out=$(docker compose exec -T db psql -X -q -U bms -d bms -v finish=$mode -f - < tools/demo_cleanup.sql 2>&1) || {
    echo "$out" >&2
    echo "Không xóa gì (giao dịch đã hủy)." >&2
    exit 1
}
echo "$out" | grep -v 'NOTICE:  FLOWABLE \|NOTICE:  KEYCLOAK '

if [ "$mode" = ROLLBACK ]; then
    echo
    echo "Đây là bản xem trước, chưa xóa gì. Chạy lại với --apply để xóa thật."
    exit 0
fi

ids=$(echo "$out" | sed -n 's/.*NOTICE:  FLOWABLE //p' | tr '\n' ' ')
if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    docker compose exec -T actions python - $ids << 'PY'
import sys

import httpx

from app import config

s = config.load()
with httpx.Client(base_url=s.flowable_url, auth=(s.flowable_user, s.flowable_password), timeout=15) as http:
    for pid in sys.argv[1:]:
        for path in (f"/runtime/process-instances/{pid}", f"/history/historic-process-instances/{pid}"):
            r = http.delete(path)
            if r.status_code not in (204, 404):
                print(f"Flowable {path}: HTTP {r.status_code}", file=sys.stderr)
print(f"đã dọn {len(sys.argv) - 1} quy trình Flowable")
PY
fi
subjects=$(echo "$out" | sed -n 's/.*NOTICE:  KEYCLOAK //p' | tr '\n' ' ')
# shellcheck disable=SC2086
docker compose exec -T actions python - $subjects << 'PY'
import re
import sys

from app import config, hr_account, keycloak_sync

s = config.load()
if not s.keycloak_provisioner_secret:
    print("chưa cấu hình client bms-provisioner: không xóa được tài khoản Keycloak", file=sys.stderr)
    sys.exit(0)
users = hr_account.KeycloakUsers(s.keycloak_url, keycloak_sync.PROVISIONER_ID, s.keycloak_provisioner_secret)
ids = set(sys.argv[1:]) | {u["id"] for u in users.usernames_like("e2e.") if re.fullmatch(r"e2e\.[0-9a-z]+", u["username"])}
print(f"đã xóa {sum(users.delete(i) for i in ids)} tài khoản Keycloak thử E2E")
PY
echo "Xong. Chỉ mục tìm kiếm sẽ được search-sync dọn trong ít giây."
