#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
#
# Kiểm thử cổng API (ADR #34) trên hệ thống đang chạy:
#   scripts/ci/gateway-smoke.sh [địa chỉ cổng, mặc định http://localhost:8000]
# Chạy sau kiểm thử đầu–cuối: bước cuối cố ý vượt giới hạn tần suất đăng nhập.
set -uo pipefail
GW="${1:-${GATEWAY:-http://localhost:8000}}"
PASSWORD="${DEMO_PASSWORD:-demo-password}"
pass=0; fail=0

check() {  # check "mô tả" "giá trị nhận được" "giá trị mong đợi"
    if [[ "$2" == "$3" ]]; then echo "ok   $1"; pass=$((pass + 1))
    else echo "FAIL $1 (nhận '$2', mong đợi '$3')"; fail=$((fail + 1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }

check "healthz" "$(curl -s --max-time 5 "$GW/healthz")" "ok"
check "mọi phản hồi có X-Request-Id" \
    "$(curl -s -o /dev/null -D - "$GW/healthz" | grep -ci '^x-request-id:')" "1"
check "không lộ phiên bản cổng" \
    "$(curl -s -o /dev/null -D - "$GW/healthz" | grep -iE '^server:.*[0-9]+\.[0-9]+' | wc -l | tr -d ' ')" "0"

# Giao diện
check "trang chủ qua cổng" "$(code "$GW/")" "200"
check "trang chủ đúng ứng dụng" "$(curl -s "$GW/" | grep -c '<title>Bamboo DX-OS</title>')" "1"
check "định tuyến phía trình duyệt (SPA)" "$(code "$GW/p/documents")" "200"

# GraphQL: token bắt buộc tại biên
Q='{"query":"query { my_tenants { tenant_code } }"}'
check "GraphQL không có token: 401 tại cổng" \
    "$(code -X POST -H 'Content-Type: application/json' -d "$Q" "$GW/graphql")" "401"
check "GraphQL token giả: 401 tại cổng" \
    "$(code -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer abc.def.ghi' -d "$Q" "$GW/graphql")" "401"
TOKEN="$(curl -s --max-time 15 -d grant_type=password -d client_id=bms-e2e -d username=tgd -d "password=$PASSWORD" \
    "$GW/realms/bms/protocol/openid-connect/token" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))')"
check "cấp token qua cổng" "$([[ -n "$TOKEN" ]] && echo có || echo không)" "có"
check "GraphQL token thật: my_tenants" \
    "$(curl -s --max-time 15 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d "$Q" "$GW/graphql" \
       | python3 -c 'import json,sys; print(",".join(t["tenant_code"] for t in json.load(sys.stdin)["data"]["my_tenants"]))')" "TDX"
check "preflight CORS cho dev server" \
    "$(curl -s -o /dev/null -D - -X OPTIONS -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' \
       -H 'Access-Control-Request-Headers: authorization,content-type' "$GW/graphql" | grep -ci '^access-control-allow-origin: http://localhost:5173')" "1"
check "websocket subscription nâng cấp được" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
       -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
       -H 'Sec-WebSocket-Protocol: graphql-transport-ws' "$GW/graphql")" "101"

# Dịch vụ phía sau không lộ ra ngoài
check "Hasura metadata API không qua cổng" "$(code -X POST -d '{}' "$GW/v1/metadata")" "404"
check "Hasura /v1/graphql không qua cổng" "$(code -X POST -d "$Q" "$GW/v1/graphql")" "404"
check "realm master (quản trị Keycloak) bị chặn" "$(code "$GW/realms/master/")" "403"
check "trang quản trị Keycloak không qua cổng" "$(code -X POST "$GW/admin/realms")" "404"
check "issuer token là địa chỉ qua cổng" \
    "$(curl -s "$GW/realms/bms/.well-known/openid-configuration" | python3 -c 'import json,sys; print(json.load(sys.stdin)["issuer"])')" \
    "$GW/realms/bms"

# S3: mỗi bucket đúng thao tác
check "không ghi vào bucket chính" "$(code -X PUT --data-binary x "$GW/bms-documents/x.txt")" "404"
check "không xóa trong bucket cách ly" "$(code -X DELETE "$GW/bms-quarantine/x.txt")" "404"
check "PUT không chữ ký bị S3 từ chối" "$(code -X PUT --data-binary x "$GW/bms-quarantine/x.txt")" "403"
check "không liệt kê bucket" "$(curl -s "$GW/bms-documents/" | grep -c ListBucketResult)" "0"

# WAF (OWASP CRS)
check "WAF chặn XSS" "$(code "$GW/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")" "403"
check "WAF chặn SQL injection" "$(code "$GW/realms/bms/account?id=1%27%20OR%20%271%27%3D%271")" "403"
check "WAF chặn duyệt thư mục" "$(code "$GW/?f=../../../../etc/passwd")" "403"

# Giới hạn tần suất đăng nhập (60/phút/IP): bước cuối vì khóa đăng nhập trong một phút.
limited=0
for _ in $(seq 1 70); do
    c=$(code -X POST -d grant_type=password -d client_id=bms-e2e -d username=x -d password=x \
        "$GW/realms/bms/protocol/openid-connect/token")
    [[ "$c" == 429 ]] && limited=1 && break
done
check "giới hạn tần suất đăng nhập" "$limited" "1"

echo "$pass đạt, $fail không đạt"
[[ $fail -eq 0 ]]
