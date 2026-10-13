#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
#
# Khởi động broker bằng script của image rồi, qua listener LOCAL (localhost, người dùng ANONYMOUS là super user),
# đặt mật khẩu SCRAM và ACL cho từng dịch vụ (ADR #45). Làm lại mỗi lần khởi động: đổi mật khẩu trong .env rồi
# `docker compose up -d` là đủ. Healthcheck chỉ báo sẵn sàng khi bước này xong.
set -euo pipefail

READY=/tmp/bamboo-kafka-ready
BIN=/opt/kafka/bin
LOCAL=(--bootstrap-server localhost:9094)
rm -f "$READY"

/etc/kafka/docker/run &
broker=$!
trap 'kill -TERM "$broker" 2>/dev/null; wait "$broker"' TERM INT

until "$BIN/kafka-broker-api-versions.sh" "${LOCAL[@]}" >/dev/null 2>&1; do
    kill -0 "$broker" 2>/dev/null || { wait "$broker"; exit $?; }
    sleep 2
done

scram_user() {  # scram_user <tên> <mật khẩu>
    # kafka-configs tách giá trị theo dấu phẩy và ngoặc vuông; Debezium đặt mật khẩu trong chuỗi JAAS có nháy kép.
    if [[ -z "$2" || "$2" == *[,\[\]=\"\\]* ]]; then
        echo "Mật khẩu Kafka của $1 trống hoặc chứa , [ ] = \" \\" >&2
        kill -TERM "$broker"; wait "$broker" || true; exit 1
    fi
    "$BIN/kafka-configs.sh" "${LOCAL[@]}" --alter --entity-type users --entity-name "$1" \
        --add-config "SCRAM-SHA-512=[password=$2]" >/dev/null
}

allow() {  # allow <tên> <tiền tố topic> <thao tác>...
    local user=$1 prefix=$2; shift 2
    local ops=()
    for op in "$@"; do ops+=(--operation "$op"); done
    "$BIN/kafka-acls.sh" "${LOCAL[@]}" --add --allow-principal "User:$user" "${ops[@]}" \
        --topic "$prefix" --resource-pattern-type prefixed >/dev/null
}

# Debezium ghi topic CDC bms.<schema>.<bảng> và topic nhịp tim; tự tạo topic cho bảng mới.
scram_user debezium "${DEBEZIUM_KAFKA_PASSWORD:-}"
allow debezium bms. Write Create Describe
allow debezium __debezium-heartbeat Write Create Describe
# lakehouse-sink chỉ đọc topic CDC, tự gán partition (không dùng consumer group).
scram_user lakehouse "${LAKEHOUSE_KAFKA_PASSWORD:-}"
allow lakehouse bms. Read Describe

echo "Đã đặt tài khoản SCRAM và ACL cho debezium, lakehouse"
touch "$READY"
wait "$broker"
