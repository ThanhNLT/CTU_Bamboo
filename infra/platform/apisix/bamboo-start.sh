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

# Khởi động cổng APISIX. Có OTEL_EXPORTER_OTLP_ENDPOINT (nhóm observability, như dịch vụ actions) thì bật lấy mẫu
# truy vết (parent_base: tiếp tục traceparent của client, không có thì lấy mẫu mọi yêu cầu) và trỏ plugin opentelemetry
# về collector đó; không có thì giữ always_off để cổng không gửi span đi đâu.
set -eu

CONF=/usr/local/apisix/conf/apisix.yaml
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
    "$CONF"
  echo "bamboo-start: bật truy vết OpenTelemetry, collector ${address}"
fi

exec /docker-entrypoint.sh "$@"
