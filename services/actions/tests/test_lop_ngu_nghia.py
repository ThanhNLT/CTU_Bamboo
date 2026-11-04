# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import pytest

from app import lakehouse_query, semantic
from app.common import ActionError


def test_sinh_sql_theo_danh_muc():
    sql, columns, info = semantic.compile_query(
        {
            "metric": "request_amount",
            "dimensions": ["status"],
            "time_grain": "month",
            "from": "2026-01-01",
            "to": "2026-03-31",
            "filters": [{"dimension": "status", "values": ["APPROVED", "PENDING"]}],
            "limit": 50,
        }
    )
    assert columns == ["period", "status", "value"] and info["source"] == "proc_purchase_request"
    assert sql == (
        "SELECT CAST(date_trunc('month', at_timezone(created_at, 'Asia/Ho_Chi_Minh')) AS date) AS period, "
        '"status" AS "status", coalesce(sum(total_amount), 0) AS value FROM "proc_purchase_request" '
        "WHERE created_at >= TIMESTAMP '2026-01-01 00:00:00 Asia/Ho_Chi_Minh' "
        "AND created_at < TIMESTAMP '2026-04-01 00:00:00 Asia/Ho_Chi_Minh' "
        "AND \"status\" IN ('APPROVED', 'PENDING') GROUP BY 1, 2 ORDER BY 1, 2 LIMIT 50"
    )


def test_tong_khong_chieu_va_gioi_han():
    sql, columns, _ = semantic.compile_query({"metric": "order_count", "limit": 999999})
    assert sql == 'SELECT count(*) AS value FROM "ic_ic_order" LIMIT 1000' and columns == ["value"]


@pytest.mark.parametrize(
    "args",
    [
        {"metric": "x; DROP TABLE a"},
        {"metric": "request_count", "dimensions": ["kpi"]},
        {"metric": "request_count", "dimensions": ["status", "status"]},
        {"metric": "request_count", "dimensions": ['status" FROM x --']},
        {"metric": "request_count", "time_grain": "year"},
        {"metric": "request_count", "from": "2026-01-01' OR '1'='1"},
        {"metric": "request_count", "filters": [{"dimension": "status", "values": ["a' OR 1=1 --"]}]},
        {"metric": "request_count", "filters": [{"dimension": "total_amount", "values": ["1"]}]},
        {"metric": "request_count", "filters": [{"dimension": "status", "values": []}]},
    ],
)
def test_tu_choi_dau_vao_ngoai_danh_muc(args):
    with pytest.raises(ActionError):
        semantic.compile_query(args)


class FakeTrino:
    def __init__(self):
        self.sql = []

    def query(self, sql, **kwargs):
        self.sql.append((sql, kwargs))
        return [{"name": "value", "type": "bigint"}], [[7]]


def test_truy_van_chay_bang_tai_khoan_tenant(monkeypatch):
    client = FakeTrino()
    monkeypatch.setattr(lakehouse_query, "_require", lambda *a: ("11111111-1111-1111-1111-111111111111", client))
    out = semantic.semantic_query(None, {}, {"metric": "request_count"}, None)
    assert out["rows"] == [[7]] and out["columns"] == ["value"] and out["unit"] == "đề nghị"
    assert client.sql[0][1] == {"as_user": "t_11111111-1111-1111-1111-111111111111", "schema": "silver"}
    catalog = semantic.semantic_catalog(None, {}, {}, None)
    assert {s["name"] for s in catalog["sources"]} == set(semantic.SOURCES)


def test_nhieu_chi_so_cung_nguon_cho_bieu_do():
    sql, columns, info = semantic.compile_query(
        {"metrics": ["request_count", "request_amount"], "dimensions": ["category"], "limit": 20}
    )
    assert columns == ["category", "request_count", "request_amount"]
    assert sql == (
        'SELECT "category_code" AS "category", count(*) AS "request_count", '
        'coalesce(sum(total_amount), 0) AS "request_amount" FROM "proc_purchase_request" '
        "GROUP BY 1 ORDER BY 1 LIMIT 20"
    )
    assert [m["name"] for m in info["measures"]] == ["request_count", "request_amount"]
    assert info["measures"][1]["unit"] == "đồng"


@pytest.mark.parametrize(
    "args",
    [
        {"metrics": []},
        {"metrics": ["request_count", "order_count"]},
        {"metrics": ["request_count", "request_count"]},
        {"metrics": ["kpi_avg", "kpi_max", "kpi_min", "kpi_periods", "kpi_avg"]},
    ],
)
def test_nhieu_chi_so_tu_choi_khac_nguon_hoac_lap(args):
    with pytest.raises(ActionError):
        semantic.compile_query(args)
