# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Lớp ngữ nghĩa trên Lakehouse: người dùng chọn chỉ số, chiều và bộ lọc theo tên nghiệp vụ, hệ thống sinh câu truy vấn.

Chỉ tên trong danh mục dưới đây mới vào được câu SQL; giá trị lọc được kiểm định dạng chặt, nên không có cách đưa SQL tự do
vào. Truy vấn chạy bằng tài khoản Trino của chính tenant nên luật lọc theo tenant của tầng silver vẫn áp dụng.
"""

import datetime as dt
import re

import psycopg

from . import lakehouse_query
from .common import ActionError, Context

VALUE = re.compile(r"^[\w.:@\- ]{1,64}$", re.UNICODE)
GRAINS = {"day": "ngày", "week": "tuần", "month": "tháng"}
MAX_LIMIT = 1000

# Mỗi nguồn: bảng silver, cột thời gian, các chiều (tên → cột) và các chỉ số (tên → biểu thức tổng hợp)
SOURCES = {
    "proc_purchase_request": {
        "label": "Đề nghị mua sắm",
        "time": "created_at",
        "dimensions": {"status": ("Trạng thái", "status"), "category": ("Nhóm hàng", "category_code")},
        "measures": {
            "request_count": ("Số đề nghị", "count(*)", "đề nghị"),
            "request_amount": ("Tổng giá trị đề nghị", "coalesce(sum(total_amount), 0)", "đồng"),
            "request_avg": ("Giá trị trung bình mỗi đề nghị", "coalesce(avg(total_amount), 0)", "đồng"),
        },
    },
    "ic_ic_order": {
        "label": "Đơn hàng nội bộ",
        "time": "created_at",
        "dimensions": {"status": ("Trạng thái", "status")},
        "measures": {
            "order_count": ("Số đơn hàng nội bộ", "count(*)", "đơn"),
            "order_amount": ("Tổng giá trị đơn hàng nội bộ", "coalesce(sum(total_amount), 0)", "đồng"),
        },
    },
    "kpi_snapshot": {
        "label": "KPI đã đóng băng",
        "time": "period_start",
        "dimensions": {"kpi": ("Chỉ số", "kpi_key"), "grain": ("Chu kỳ", "grain")},
        "measures": {
            "kpi_avg": ("Giá trị KPI trung bình", "avg(value)", ""),
            "kpi_max": ("Giá trị KPI lớn nhất", "max(value)", ""),
            "kpi_min": ("Giá trị KPI nhỏ nhất", "min(value)", ""),
            "kpi_periods": ("Số kỳ đã đóng băng", "count(*)", "kỳ"),
        },
    },
}
MEASURES = {name: (source, m) for source, spec in SOURCES.items() for name, m in spec["measures"].items()}


def _date(text, field: str) -> str:
    try:
        return dt.date.fromisoformat(str(text)).isoformat()
    except ValueError as exc:
        raise ActionError(f"{field} phải có dạng YYYY-MM-DD") from exc


def _literal(value) -> str:
    text = str(value)
    if not VALUE.match(text):
        raise ActionError("Giá trị lọc chỉ gồm chữ, số và . : @ - _ (tối đa 64 ký tự)")
    return "'" + text.replace("'", "''") + "'"


def compile_query(args: dict) -> tuple[str, list[str], dict]:
    """Trả về (SQL, tên cột kết quả, mô tả nguồn). Mọi tên đều phải nằm trong danh mục."""
    metric = args.get("metric")
    if metric not in MEASURES:
        raise ActionError(f"Chỉ số không có trong danh mục: {metric}", "not-found", 404)
    source, (label, expression, unit) = MEASURES[metric]
    spec = SOURCES[source]
    dims = list(args.get("dimensions") or [])
    if len(set(dims)) != len(dims) or len(dims) > 3:
        raise ActionError("Tối đa 3 chiều, không lặp")
    unknown = [d for d in dims if d not in spec["dimensions"]]
    if unknown:
        raise ActionError(f"Chiều “{unknown[0]}” không dùng được với chỉ số này")
    select, group, columns = [], [], []
    grain = args.get("time_grain")
    if grain:
        if grain not in GRAINS:
            raise ActionError("Chu kỳ thời gian chỉ gồm day, week, month")
        select.append(
            f"CAST(date_trunc('{grain}', at_timezone({spec['time']}, 'Asia/Ho_Chi_Minh')) AS date) AS period"
        )
        group.append("1")
        columns.append("period")
    for dim in dims:
        select.append(f'"{spec["dimensions"][dim][1]}" AS "{dim}"')
        group.append(str(len(select)))
        columns.append(dim)
    select.append(f"{expression} AS value")
    columns.append("value")

    where = []
    if args.get("from"):
        where.append(f"{spec['time']} >= TIMESTAMP '{_date(args['from'], 'Từ ngày')} 00:00:00 Asia/Ho_Chi_Minh'")
    if args.get("to"):
        end = dt.date.fromisoformat(_date(args["to"], "Đến ngày")) + dt.timedelta(days=1)
        where.append(f"{spec['time']} < TIMESTAMP '{end.isoformat()} 00:00:00 Asia/Ho_Chi_Minh'")
    for item in args.get("filters") or []:
        name = item.get("dimension")
        if name not in spec["dimensions"]:
            raise ActionError(f"Không lọc được theo chiều “{name}”")
        values = list(item.get("values") or [])
        if not 1 <= len(values) <= 20:
            raise ActionError("Mỗi bộ lọc cần từ 1 đến 20 giá trị")
        where.append(f'"{spec["dimensions"][name][1]}" IN ({", ".join(_literal(v) for v in values)})')
    limit = min(max(int(args.get("limit") or 200), 1), MAX_LIMIT)
    sql = f'SELECT {", ".join(select)} FROM "{source}"'
    if where:
        sql += " WHERE " + " AND ".join(where)
    if group:
        sql += " GROUP BY " + ", ".join(group) + " ORDER BY " + ", ".join(group)
    sql += f" LIMIT {limit}"
    return sql, columns, {"source": source, "measure": metric, "label": label, "unit": unit}


def semantic_catalog(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> dict:
    lakehouse_query._require(conn, session, ctx)
    return {
        "sources": [
            {
                "name": name,
                "label": spec["label"],
                "dimensions": [{"name": k, "label": v[0]} for k, v in spec["dimensions"].items()],
                "measures": [{"name": k, "label": v[0], "unit": v[2]} for k, v in spec["measures"].items()],
            }
            for name, spec in SOURCES.items()
        ],
        "grains": [{"name": k, "label": v} for k, v in GRAINS.items()],
    }


def semantic_query(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    tenant, client = lakehouse_query._require(conn, session, ctx)
    sql, columns, info = compile_query(args)
    _, rows = lakehouse_query._query(client, tenant, sql)
    return {
        **info,
        "columns": columns,
        "rows": [[str(c) if isinstance(c, dt.date | dt.datetime) else c for c in row] for row in rows],
        "sql": sql,
    }


HANDLERS = {"semantic_catalog": semantic_catalog, "semantic_query": semantic_query}
