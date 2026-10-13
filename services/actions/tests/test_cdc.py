# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""CDC (ADR #38): Debezium đọc WAL của CSDL bms và ghi vào Kafka. Kiểm thử chỉ đọc Kafka, không ghi dữ liệu
nghiệp vụ: nhịp tim Debezium tự ghi mỗi 10 giây đi hết đường CSDL → Debezium → Kafka. Đọc bằng tài khoản SCRAM
`lakehouse` (ADR #45) lấy từ OpenBao; kiểm thêm Kafka từ chối client không xác thực và tài khoản chỉ đọc không ghi được.

Biến môi trường: KAFKA_BOOTSTRAP (mặc định kafka:9092). Không truy cập được thì bỏ qua (REQUIRE_SERVICES=1: lỗi).
"""

# ===== Thư viện chuẩn =====
import json
import os
import time

# ===== Thư viện bên ngoài =====
import pytest  # pytest

# ===== Module nội bộ =====
from app import config
from conftest import _missing, root_settings

# ===== Khởi tạo =====
kafka = pytest.importorskip("kafka")

# ===== Hằng số & cấu hình =====
SETTINGS = root_settings()
OPTIONS = config.kafka_options(SETTINGS)
PREFIX = "bms"


# ===== Fixture kiểm thử =====
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


# ===== Hàm hỗ trợ kiểm thử =====
def _messages(topic: str, *, from_end: bool, timeout: float, limit: int = 50) -> list[dict]:
    consumer = kafka.KafkaConsumer(**OPTIONS, enable_auto_commit=False, consumer_timeout_ms=int(timeout * 1000))
    parts = [kafka.TopicPartition(topic, p) for p in consumer.partitions_for_topic(topic)]
    consumer.assign(parts)
    (consumer.seek_to_end if from_end else consumer.seek_to_beginning)(*parts)
    out = []
    for msg in consumer:
        if msg.value is not None:  # bỏ tombstone sau thao tác xóa
            out.append(json.loads(msg.value))
        if len(out) >= limit:
            break
    consumer.close()
    return out


# ===== Kiểm thử =====
def test_nhip_tim_di_het_duong_cdc(topics):
    """Debezium ghi cdc.heartbeat mỗi 10 giây; thay đổi đó phải quay lại Kafka qua WAL."""
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


# ===== Khởi tạo =====
needs_sasl = pytest.mark.skipif(not SETTINGS.kafka_password, reason="Kafka chạy không xác thực (native)")


# ===== Kiểm thử =====
@needs_sasl
@pytest.mark.parametrize(
    "options",
    [
        {"bootstrap_servers": SETTINGS.kafka_bootstrap},  # không SASL
        {**OPTIONS, "sasl_plain_password": SETTINGS.kafka_password + "-sai"},  # sai mật khẩu
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
