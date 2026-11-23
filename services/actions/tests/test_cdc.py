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

import json
import os
import time

import pytest

from app import config
from conftest import _missing, root_settings

kafka = pytest.importorskip("kafka")

SETTINGS = root_settings()
OPTIONS = config.kafka_options(SETTINGS)
PREFIX = "bms"


@pytest.fixture(scope="module")
def topics() -> set[str]:
    deadline = time.monotonic() + float(os.environ.get("WAIT_FOR_SERVICES", "180"))
    while True:
        try:
            consumer = kafka.KafkaConsumer(**OPTIONS, request_timeout_ms=10000)
            names = consumer.topics()
            consumer.close()
            if f"{PREFIX}.cdc.heartbeat" in names:
                return names
        except kafka.errors.KafkaError:
            pass
        if time.monotonic() > deadline:
            _missing("Kafka/Debezium")
        time.sleep(3)


def _messages(topic: str, *, from_end: bool, timeout: float, limit: int = 50) -> list[dict]:
    consumer = kafka.KafkaConsumer(**OPTIONS, enable_auto_commit=False, consumer_timeout_ms=int(timeout * 1000))
    parts = [kafka.TopicPartition(topic, p) for p in consumer.partitions_for_topic(topic)]
    consumer.assign(parts)
    (consumer.seek_to_end if from_end else consumer.seek_to_beginning)(*parts)
    out = []
    for msg in consumer:
        if msg.value is not None:
            out.append(json.loads(msg.value))
        if len(out) >= limit:
            break
    consumer.close()
    return out


def test_nhip_tim_di_het_duong_cdc(topics):
    events = _messages(f"{PREFIX}.cdc.heartbeat", from_end=True, timeout=45, limit=1)
    assert events, "không nhận được nhịp tim mới trong 45 giây"
    event = events[0]
    assert event["op"] == "u" and event["source"]["schema"] == "cdc" and event["source"]["table"] == "heartbeat"
    assert event["after"]["id"] == 1


def test_thay_doi_nghiep_vu_vao_kafka(topics):
    topic = f"{PREFIX}.proc.purchase_request"
    assert topic in topics, sorted(topics)
    events = _messages(topic, from_end=False, timeout=10)
    assert events
    row = events[-1]["after"] or events[-1]["before"]
    assert {"tenant_id", "id", "doc_no", "status", "total_amount"} <= row.keys()
    assert isinstance(row["total_amount"], str), "số tiền giữ dạng chuỗi, không mất chính xác"


def test_khong_day_nhat_ky_va_hang_doi(topics):
    leaked = sorted(t for t in topics if t.startswith((f"{PREFIX}.audit.", f"{PREFIX}.search.", f"{PREFIX}.public.")))
    assert leaked == [], "nhật ký kiểm toán, hàng đợi tìm kiếm không đi vào Kafka"


needs_sasl = pytest.mark.skipif(not SETTINGS.kafka_password, reason="Kafka chạy không xác thực (native)")


@needs_sasl
@pytest.mark.parametrize(
    "options",
    [
        {"bootstrap_servers": SETTINGS.kafka_bootstrap},
        {**OPTIONS, "sasl_plain_password": SETTINGS.kafka_password + "-sai"},
    ],
    ids=["khong-sasl", "sai-mat-khau"],
)
def test_kafka_tu_choi_client_khong_xac_thuc(topics, options):
    with pytest.raises(kafka.errors.KafkaTimeoutError, match="Unable to bootstrap"):
        kafka.KafkaConsumer(**options, request_timeout_ms=3000, bootstrap_timeout_ms=5000)


@needs_sasl
def test_tai_khoan_chi_doc_khong_ghi_duoc(topics):
    producer = kafka.KafkaProducer(**OPTIONS, enable_idempotence=False, max_block_ms=10000, retries=0)
    try:
        with pytest.raises((kafka.errors.TopicAuthorizationFailedError, kafka.errors.KafkaTimeoutError)):
            producer.send(f"{PREFIX}.proc.purchase_request", b"{}").get(timeout=10)
    finally:
        producer.close(timeout=5)
