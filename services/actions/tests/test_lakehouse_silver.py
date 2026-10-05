# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Tầng silver và Trino (ADR #40): kiểu cột suy từ PostgreSQL, tệp SQL sinh sẵn khớp CSDL, và đường đầy đủ
CSDL → Debezium → Kafka → lakehouse-sink → Iceberg → Trino cho đúng trạng thái hiện tại.

Biến môi trường: TRINO_URL (mặc định http://trino:8080); CDC_SOURCE_DATABASE_URL là CSDL Debezium đọc
(mặc định CSDL `bms` cùng máy chủ với TEST_DATABASE_URL). Kiểm thử chỉ đọc, không ghi CSDL nguồn.
"""

import os
import time
from decimal import Decimal
from urllib.parse import urlparse, urlunparse

import httpx
import psycopg
import pytest

from app import lakehouse_silver as silver
from conftest import ROOT, TEST_DB_URL, _missing, _reachable

TRINO_URL = os.environ.get("TRINO_URL", "http://trino:8080")
SOURCE_URL = os.environ.get("CDC_SOURCE_DATABASE_URL") or urlunparse(urlparse(TEST_DB_URL)._replace(path="/bms"))


@pytest.mark.parametrize("typname, category, typmod, expected_type, fragment", [
    ("uuid", "U", -1, "uuid", "CAST(json_extract_scalar(after, '$[\"c\"]') AS uuid)"),
    ("numeric", "N", (18 << 16 | 2) + 4, "decimal(18, 2)", "AS decimal(18, 2))"),
    ("numeric", "N", -1, "double", "AS double)"),
    ("int4", "N", -1, "integer", "AS integer)"),
    ("date", "D", -1, "date", "date_add('day', CAST("),
    ("timestamptz", "D", -1, "timestamp(6) with time zone", "from_iso8601_timestamp_nanos("),
    ("_uuid", "A", -1, "array(varchar)", "CAST(json_extract(after, '$[\"c\"]') AS array(varchar))"),
    ("tstzrange", "R", -1, "varchar", "json_extract_scalar(after, '$[\"c\"]')"),
    ("jsonb", "U", -1, "varchar", "json_extract_scalar("),
])
def test_kieu_cot(typname, category, typmod, expected_type, fragment):
    expr, trino_type = silver.column_expr("c", typname, category, typmod, None)
    assert trino_type == expected_type and fragment in expr, expr


def test_ten_cot_duoc_trich_dan():
    expr, _ = silver.column_expr("it's", "text", "S", -1, None)
    assert expr == "json_extract_scalar(after, '$[\"it''s\"]')"


def test_tep_sql_khop_csdl(database):
    """platform/trino/silver.sql phải được sinh lại khi đổi cấu trúc CSDL (make trino-sql)."""
    with psycopg.connect(database) as conn:
        expected = silver.build(conn)
    committed = (ROOT / "platform/trino/silver.sql").read_text(encoding="utf-8")
    assert committed == expected, "chạy lại: python -m app.lakehouse_silver (make trino-sql)"
    assert "lakehouse.silver.proc_purchase_request" in expected and "audit_" not in expected


class Trino:
    """Client REST tối giản của Trino (POST /v1/statement, theo nextUri)."""

    def __init__(self, url: str):
        self.http = httpx.Client(base_url=url, timeout=60, headers={"X-Trino-User": "kiem-thu"})

    def query(self, sql: str) -> list[list]:
        resp = self.http.post("/v1/statement", content=sql).json()
        rows = []
        while True:
            if "error" in resp:
                raise AssertionError(resp["error"].get("message"))
            rows += resp.get("data", [])
            if "nextUri" not in resp:
                return rows
            resp = self.http.get(resp["nextUri"]).json()


@pytest.fixture(scope="module")
def trino() -> Trino:
    if not _reachable(TRINO_URL + "/v1/info"):
        _missing("Trino")
    client = Trino(TRINO_URL)
    deadline = time.monotonic() + 120
    while not client.query("SELECT count(*) FROM lakehouse.information_schema.tables WHERE table_schema = 'silver'")[0][0]:
        if time.monotonic() > deadline:
            _missing("view silver (trino-init)")
        time.sleep(3)
    return client


def test_view_silver_co_kieu(trino):
    columns = dict(trino.query("SELECT column_name, data_type FROM lakehouse.information_schema.columns "
                               "WHERE table_schema = 'silver' AND table_name = 'proc_purchase_request'"))
    assert columns["id"] == "uuid" and columns["total_amount"] == "decimal(18,2)"
    assert columns["needed_by"] == "date" and columns["created_at"] == "timestamp(6) with time zone"
    assert {"_changed_at", "_lsn"} <= columns.keys()


def test_silver_khop_csdl_nguon(trino):
    """Mọi đề nghị trong CSDL nguồn có trong silver với cùng tiêu đề, tổng tiền, trạng thái (chờ tối đa
    2 phút cho Debezium và lakehouse-sink theo kịp)."""
    try:
        with psycopg.connect(SOURCE_URL) as conn:
            source = {str(r[0]): (r[1], r[2], r[3]) for r in conn.execute(
                "SELECT id, title, total_amount, status FROM proc.purchase_request").fetchall()}
    except psycopg.OperationalError:
        _missing(f"CSDL nguồn CDC ({urlparse(SOURCE_URL).path})")
    if not source:
        pytest.skip("CSDL nguồn chưa có đề nghị")
    deadline = time.monotonic() + 120
    while True:
        lake = {r[0]: (r[1], Decimal(r[2]), r[3]) for r in trino.query(
            "SELECT CAST(id AS varchar), title, CAST(total_amount AS varchar), status "
            "FROM lakehouse.silver.proc_purchase_request")}
        missing = {k: v for k, v in source.items() if lake.get(k) != v}
        if not missing or time.monotonic() > deadline:
            break
        time.sleep(5)
    assert not missing, f"{len(missing)}/{len(source)} đề nghị chưa khớp, ví dụ {next(iter(missing.items()))}"
