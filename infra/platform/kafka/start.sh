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

READY=/tmp/bamboo-kafka-ready
BIN=/opt/kafka/bin
LOCAL=(--bootstrap-server localhost:9094)
rm -f "$READY"

/etc/kafka/docker/run &
broker=$!
trap 'kill -TERM "$broker" 2>/dev/null; wait "$broker"' TERM INT

until "$BIN/kafka-broker-api-versions.sh" "${LOCAL[@]}" > /dev/null 2>&1; do
    kill -0 "$broker" 2> /dev/null || {
        wait "$broker"
        exit $?
    }
    sleep 2
done

scram_user() {
    if [[ -z "$2" || "$2" == *[,\[\]=\"\\]* ]]; then
        echo "Mật khẩu Kafka của $1 trống hoặc chứa , [ ] = \" \\" >&2
        kill -TERM "$broker"
        wait "$broker" || true
        exit 1
    fi
    "$BIN/kafka-configs.sh" "${LOCAL[@]}" --alter --entity-type users --entity-name "$1" \
        --add-config "SCRAM-SHA-512=[password=$2]" > /dev/null
}

allow() {
    local user=$1 prefix=$2
    shift 2
    local ops=()
    for op in "$@"; do ops+=(--operation "$op"); done
    "$BIN/kafka-acls.sh" "${LOCAL[@]}" --add --allow-principal "User:$user" "${ops[@]}" \
        --topic "$prefix" --resource-pattern-type prefixed > /dev/null
}

scram_user debezium "${DEBEZIUM_KAFKA_PASSWORD:-}"
allow debezium bms. Write Create Describe
allow debezium __debezium-heartbeat Write Create Describe
scram_user lakehouse "${LAKEHOUSE_KAFKA_PASSWORD:-}"
allow lakehouse bms. Read Describe

echo "Đã đặt tài khoản SCRAM và ACL cho debezium, lakehouse"
touch "$READY"
wait "$broker"
