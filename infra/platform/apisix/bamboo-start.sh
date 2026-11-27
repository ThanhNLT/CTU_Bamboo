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

# Khởi động cổng APISIX: dựng conf/config.yaml, conf/apisix.yaml từ bản gốc trong image (conf/bamboo/) mỗi lần chạy rồi
# áp các tùy chọn theo biến môi trường, nên khởi động lại container luôn ra cùng kết quả và nhận chứng chỉ mới.
#
# - OTEL_EXPORTER_OTLP_ENDPOINT (nhóm observability, như dịch vụ actions): bật lấy mẫu truy vết (parent_base: tiếp tục
#   traceparent của client, không có thì lấy mẫu mọi yêu cầu) và trỏ plugin opentelemetry về collector đó; không có thì
#   giữ always_off để cổng không gửi span đi đâu.
# - GATEWAY_TLS_DIR (infra/compose/mtls.yml, ADR #76): gọi Hasura, actions, Keycloak bằng HTTPS, trình chứng chỉ máy
#   khách `gateway` do CA nội bộ cấp và chỉ tin CA đó; forward-auth (không gắn được chứng chỉ máy khách) đi vòng qua
#   route nội bộ chỉ nhận từ 127.0.0.1 của chính cổng.
set -eu

DIR=/usr/local/apisix/conf
cp "$DIR/bamboo/config.yaml" "$DIR/config.yaml"
cp "$DIR/bamboo/apisix.yaml" "$DIR/apisix.yaml"

endpoint="${OTEL_EXPORTER_OTLP_ENDPOINT:-}"
if [ -n "$endpoint" ]; then
  # APISIX nhận host:port cho collector HTTP; https:// thì giữ nguyên địa chỉ đầy đủ.
  case "$endpoint" in
    http://*) address="${endpoint#http://}" ;;
    *) address="$endpoint" ;;
  esac
  address="${address%/}"
  sed -i \
    -e "s|^\( *address: \).* # BAMBOO_OTEL_COLLECTOR\$|\1${address} # BAMBOO_OTEL_COLLECTOR|" \
    -e "s|^\( *name: \)always_off # BAMBOO_TRACE_SAMPLER\$|\1parent_base # BAMBOO_TRACE_SAMPLER|" \
    "$DIR/apisix.yaml"
  echo "bamboo-start: bật truy vết OpenTelemetry, collector ${address}"
fi

tls="${GATEWAY_TLS_DIR:-}"
if [ -n "$tls" ]; then
  for f in gateway.crt gateway.key ca.crt; do
    [ -s "$tls/$f" ] || { echo "bamboo-start: thiếu $tls/$f (openbao-init chưa cấp chứng chỉ gateway)" >&2; exit 1; }
  done
  # Node "dịch-vụ:cổng-http": 1 # BAMBOO_MTLS dịch-vụ:cổng-https -> HTTPS, chứng chỉ máy khách, kiểm chứng chỉ máy chủ.
  {
    echo "ssls:"
    echo "  - id: gateway-client"
    echo "    type: client"
    echo "    cert: |"
    sed 's/^/      /' "$tls/gateway.crt"
    echo "    key: |"
    sed 's/^/      /' "$tls/gateway.key"
    # CA nội bộ khai thẳng trong upstream (tls.ca_certs): proxy_ssl_trusted_certificate toàn cục không được áp dụng khi
    # kiểm chứng chỉ upstream theo từng yêu cầu, Keycloak trả 502 "self-signed certificate in certificate chain".
    awk -v ca="$tls/ca.crt" '
      BEGIN { while ((getline line < ca) > 0) pem = pem "            " line "\n" }
      /^ *"[^"]*": 1 # BAMBOO_MTLS / {
        indent = substr($0, 1, index($0, "\"") - 1)
        n = split($0, part, "# BAMBOO_MTLS ")
        print indent "\"" part[n] "\": 1"
        print "    scheme: https"
        print "    tls:"
        print "      client_cert_id: gateway-client"
        print "      verify: true"
        print "      ca_certs:"
        print "        - |"
        printf "%s", pem
        next
      }
      { sub(/uri: http:\/\/actions:8000\/auth\/gateway$/, "uri: http://127.0.0.1:9080/__bamboo/auth-gateway"); print }
    ' "$DIR/apisix.yaml"
  } > "$DIR/apisix.yaml.new"
  mv "$DIR/apisix.yaml.new" "$DIR/apisix.yaml"
  awk -v ca="$tls/ca.crt" '{ print } /^apisix:$/ { print "  ssl:"; print "    ssl_trusted_certificate: " ca }' \
    "$DIR/config.yaml" > "$DIR/config.yaml.new"
  mv "$DIR/config.yaml.new" "$DIR/config.yaml"
  echo "bamboo-start: mTLS tới Hasura, actions, Keycloak (chứng chỉ $tls/gateway.crt)"
fi

exec /docker-entrypoint.sh "$@"
