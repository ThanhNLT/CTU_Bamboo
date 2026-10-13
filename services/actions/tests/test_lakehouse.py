# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Lakehouse (ADR #39): topic CDC → bảng Iceberg bronze, đúng một lần nhờ vị trí Kafka lưu trong snapshot.

Kiểm thử tích hợp ghi vào catalog riêng (CSDL lakehouse_test, thư mục warehouse-test/<ngẫu nhiên> trong bucket
lakehouse) từ các topic CDC thật; khóa S3 lakehouse đọc từ OpenBao bằng root token như search_settings.
"""

# ===== Thư viện chuẩn =====
import datetime as dt
import json
import uuid
from urllib.parse import urlparse, urlunparse

# ===== Thư viện bên ngoài =====
import psycopg  # psycopg
import pytest  # pytest

# ===== Module nội bộ =====
from app import config
from app import lakehouse_sink as ls
from conftest import TEST_DB_URL, _missing, _reachable, root_settings

# ===== Khởi tạo =====
pytest.importorskip("pyiceberg")
kafka = pytest.importorskip("kafka")

# ===== Hằng số & cấu hình =====
EVENT = {
    "before": None,
    "after": {"tenant_id": "t-1", "id": "pr-1", "title": "Tụ điện", "total_amount": "300000.00"},
    "source": {
        "connector": "postgresql",
        "db": "bms",
        "schema": "proc",
        "table": "purchase_request",
        "lsn": 123456,
        "txId": 789,
        "ts_ms": 1791165722100,
        "ts_us": 1791165722100088,
    },
    "op": "u",
    "ts_ms": 1791165722200,
}


# ===== Kiểm thử =====
def test_ten_bang_va_topic():
    assert ls.table_name("bms.proc.purchase_request") == "bronze.proc_purchase_request"
    for topic in ("bms.proc.purchase_request", "bms.core.person", "bms.wf.approval_step"):
        assert ls.TOPIC_PATTERN.match(topic)
    for topic in ("bms.cdc.heartbeat", "__debezium-heartbeat.bms", "bms.audit.log", "khac.proc.x"):
        assert not ls.TOPIC_PATTERN.match(topic), topic


def test_su_kien_thanh_dong_bronze():
    now = dt.datetime(2026, 10, 5, tzinfo=dt.UTC)
    row = ls.to_row(0, 41, b'{"id":"pr-1"}', json.dumps(EVENT).encode(), now)
    assert row["op"] == "u" and row["lsn"] == 123456 and row["tx_id"] == 789 and row["tenant_id"] == "t-1"
    assert row["source_ts"] == dt.datetime(2026, 10, 5, 2, 2, 2, 100088, tzinfo=dt.UTC)
    assert row["source_date"] == dt.date(2026, 10, 5) and row["record_key"] == '{"id":"pr-1"}'
    assert json.loads(row["after"])["title"] == "Tụ điện" and row["before"] is None
    assert (row["kafka_partition"], row["kafka_offset"], row["ingested_at"]) == (0, 41, now)
    deleted = ls.to_row(
        0,
        42,
        None,
        json.dumps({**EVENT, "op": "d", "before": {"id": "pr-1", "tenant_id": "t-1"}, "after": None}).encode(),
        now,
    )
    assert (
        deleted["tenant_id"] == "t-1"
        and deleted["after"] is None
        and json.loads(deleted["record_key"]) == {"id": "pr-1"}
    )


# ===== Fixture kiểm thử =====
@pytest.fixture(scope="module")
def lake_settings() -> config.Settings:
    """Cấu hình ghi vào catalog kiểm thử; cần Kafka có topic CDC, SeaweedFS có bucket lakehouse."""
    settings = root_settings()
    admin = urlparse(TEST_DB_URL)
    with psycopg.connect(urlunparse(admin._replace(path="/postgres")), autocommit=True) as conn:
        conn.execute("DROP DATABASE IF EXISTS lakehouse_test WITH (FORCE)")
        conn.execute("CREATE DATABASE lakehouse_test")
    url = urlunparse(admin._replace(scheme="postgresql+psycopg", path="/lakehouse_test"))
    settings = config.Settings(**{**settings.__dict__, "lakehouse_catalog_url": url})
    try:
        consumer = kafka.KafkaConsumer(**config.kafka_options(settings), request_timeout_ms=10000)
        topics = consumer.topics()
        consumer.close()
    except kafka.errors.KafkaError:
        _missing("Kafka")
    if "bms.proc.purchase_request" not in topics:
        _missing("topic CDC bms.proc.purchase_request")
    if not _reachable(settings.s3_endpoint):
        _missing("SeaweedFS")
    return settings


# ===== Hàm hỗ trợ kiểm thử =====
def _drain(sink: ls.Sink) -> int:
    total = 0
    while n := sink.run_once(wait_seconds=30, stop_when_idle=True):
        total += n
    return total


# ===== Kiểm thử =====
def test_ghi_bronze_dung_mot_lan(lake_settings):
    warehouse = f"warehouse-test/{uuid.uuid4().hex[:8]}"
    cat = ls.catalog(lake_settings, warehouse)
    sink = ls.Sink(lake_settings, cat=cat)
    assert _drain(sink) > 0
    names = {name for _, name in cat.list_tables("bronze")}
    assert "proc_purchase_request" in names
    assert not {n for n in names if n.startswith(("cdc_", "audit_", "search_"))}, names

    table = cat.load_table("bronze.proc_purchase_request")
    rows = table.scan().to_arrow()
    assert rows.num_rows > 0 and set(rows.column("op").to_pylist()) <= {"r", "c", "u", "d"}
    assert all(json.loads(a)["doc_no"] for a in rows.column("after").to_pylist() if a)
    assert [f.name for f in table.spec().fields] == ["source_date"]

    # Vị trí Kafka lưu trong snapshot = dòng cuối đã ghi + 1; khởi động lại đọc tiếp từ đó, không ghi trùng
    # (dịch vụ khác vẫn có thể sinh thay đổi mới trong lúc kiểm thử nên không đòi lần sau ghi 0 dòng).
    assert ls.committed_offsets(table) == {0: max(rows.column("kafka_offset").to_pylist()) + 1}
    again = ls.Sink(lake_settings, cat=ls.catalog(lake_settings, warehouse))
    _drain(again)
    after = cat.load_table("bronze.proc_purchase_request").scan().to_arrow()
    pairs = list(
        zip(after.column("kafka_partition").to_pylist(), after.column("kafka_offset").to_pylist(), strict=True)
    )
    assert len(pairs) == len(set(pairs)) and after.num_rows >= rows.num_rows, "không ghi trùng sự kiện"
