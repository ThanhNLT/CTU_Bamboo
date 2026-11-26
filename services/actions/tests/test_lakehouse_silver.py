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

import json
import os
import time
from decimal import Decimal
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest

from app import lakehouse_silver as silver
from app.trino import Trino
from conftest import ROOT, TEST_DB_URL, _missing, root_settings, trino_admin_password, trino_reachable

SOURCE_URL = os.environ.get("CDC_SOURCE_DATABASE_URL") or urlunparse(urlparse(TEST_DB_URL)._replace(path="/bms"))


@pytest.mark.parametrize(
    "typname, category, typmod, expected_type, fragment",
    [
        ("uuid", "U", -1, "uuid", "CAST(json_extract_scalar(after, '$[\"c\"]') AS uuid)"),
        ("numeric", "N", (18 << 16 | 2) + 4, "decimal(18, 2)", "AS decimal(18, 2))"),
        ("numeric", "N", -1, "double", "AS double)"),
        ("int4", "N", -1, "integer", "AS integer)"),
        ("date", "D", -1, "date", "date_add('day', CAST("),
        ("timestamptz", "D", -1, "timestamp(6) with time zone", "from_iso8601_timestamp_nanos("),
        ("_uuid", "A", -1, "array(varchar)", "CAST(json_extract(after, '$[\"c\"]') AS array(varchar))"),
        ("tstzrange", "R", -1, "varchar", "json_extract_scalar(after, '$[\"c\"]')"),
        ("jsonb", "U", -1, "varchar", "json_extract_scalar("),
    ],
)
def test_kieu_cot(typname, category, typmod, expected_type, fragment):
    expr, trino_type = silver.column_expr("c", typname, category, typmod, None)
    assert trino_type == expected_type and fragment in expr, expr


def test_ten_cot_duoc_trich_dan():
    expr, _ = silver.column_expr("it's", "text", "S", -1, None)
    assert expr == "json_extract_scalar(after, '$[\"it''s\"]')"


def test_tep_sql_khop_csdl(database):
    with psycopg.connect(database) as conn:
        expected = silver.build(conn)
    committed = (ROOT / "infra/platform/trino/silver.sql").read_text(encoding="utf-8")
    assert committed == expected, "chạy lại: python -m app.lakehouse_silver (make trino-sql)"
    assert "lakehouse.silver.proc_purchase_request" in expected and "audit_" not in expected


def test_quyen_trino_khop_csdl(database):
    with psycopg.connect(database) as conn:
        expected = silver.build_rules(conn)
    committed = (ROOT / "infra/platform/trino/rules.json").read_text(encoding="utf-8")
    assert committed == expected, "chạy lại: python -m app.lakehouse_silver (make trino-sql)"
    tables = {t["table"]: t for t in json.loads(expected)["tables"] if "table" in t}
    assert tables["proc_purchase_request"]["filter"] == f'"tenant_id" = {silver.TENANT_OF_USER}'
    assert tables["core_tenant"]["filter"] == f'"id" = {silver.TENANT_OF_USER}'
    assert "core_permission" not in tables and "core_tenant_relation" not in tables


class AdminTrino(Trino):
    def rows(self, sql: str) -> list[list]:
        return self.query(sql)[1]


@pytest.fixture(scope="module")
def trino() -> AdminTrino:
    settings = root_settings()
    if not trino_reachable(settings):
        _missing("Trino")
    client = AdminTrino(settings.trino_url, silver.ADMIN_USER, trino_admin_password(), settings.trino_ca_file)
    deadline = time.monotonic() + 120
    while not client.rows("SELECT count(*) FROM lakehouse.information_schema.tables WHERE table_schema = 'silver'")[0][
        0
    ]:
        if time.monotonic() > deadline:
            _missing("view silver (trino-init)")
        time.sleep(3)
    return client


def test_view_silver_co_kieu(trino):
    columns = dict(
        trino.rows(
            "SELECT column_name, data_type FROM lakehouse.information_schema.columns "
            "WHERE table_schema = 'silver' AND table_name = 'proc_purchase_request'"
        )
    )
    assert columns["id"] == "uuid" and columns["total_amount"] == "decimal(18,2)"
    assert columns["needed_by"] == "date" and columns["created_at"] == "timestamp(6) with time zone"
    assert {"_changed_at", "_lsn"} <= columns.keys()


def test_silver_khop_csdl_nguon(trino):
    try:
        with psycopg.connect(SOURCE_URL) as conn:
            source = {
                str(r[0]): (r[1], r[2], r[3])
                for r in conn.execute("SELECT id, title, total_amount, status FROM proc.purchase_request").fetchall()
            }
    except psycopg.OperationalError:
        _missing(f"CSDL nguồn CDC ({urlparse(SOURCE_URL).path})")
    if not source:
        pytest.skip("CSDL nguồn chưa có đề nghị")
    deadline = time.monotonic() + 120
    while True:
        lake = {
            r[0]: (r[1], Decimal(r[2]), r[3])
            for r in trino.rows(
                "SELECT CAST(id AS varchar), title, CAST(total_amount AS varchar), status "
                "FROM lakehouse.silver.proc_purchase_request"
            )
        }
        missing = {k: v for k, v in source.items() if lake.get(k) != v}
        if not missing or time.monotonic() > deadline:
            break
        time.sleep(5)
    assert not missing, f"{len(missing)}/{len(source)} đề nghị chưa khớp, ví dụ {next(iter(missing.items()))}"
