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

"""Phả hệ dữ liệu thu tự động từ hệ thống đang chạy (ADR #64), thay cho phả hệ chỉ có ở tệp mẫu (ADR #50).

Đồ thị `auto` dựng lại từ chính cấu hình hệ thống, không khai tay:
PostgreSQL (bảng trong publication `bms_cdc`) → Debezium/Kafka (topic `bms.<schema>.<bảng>`) → Lakehouse (Iceberg bronze,
view silver nếu `lakehouse-sink` nhận topic đó) → lớp ngữ nghĩa (`semantic.SOURCES`) → nơi dùng (Phân tích BI, Trung tâm
điều hành, Dịch vụ dữ liệu, API). Chỉ đưa vào các bảng có nơi dùng, để đồ thị đọc được.

Thu thập định kỳ (ADR #77, flow-sync gọi `auto_collect` mỗi LINEAGE_AUTO_MINUTES phút): dựng lại đồ thị và kiểm tra mức
nền tảng không cần Trino (replication slot), ghi một lần chạy `lineage.auto`; nhờ vậy trang Phả hệ luôn có số liệu thu từ
pipeline đang chạy mà không ai phải bấm. Đối chiếu theo công ty cần Trino nên vẫn chạy theo yêu cầu.

Kiểm tra chất lượng chạy khi người dùng bấm thu thập (đối chiếu số dòng cần Trino, không chạy theo lịch để Trino được
ngủ, ADR #53):
- mức nền tảng: replication slot của Debezium còn hoạt động và lượng WAL chưa đọc;
- theo công ty: số dòng PostgreSQL của công ty so với view silver đọc bằng tài khoản Trino của công ty (row filter), lệch
  trong phạm vi các dòng vừa đổi 5 phút gần đây coi là đang đồng bộ. Mỗi lần đối chiếu ghi một lần chạy.
"""

import logging
import time

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from . import lakehouse_query, lakehouse_sink, semantic
from .common import ActionError, Context
from .trino import TrinoError

log = logging.getLogger("lineage_sync")

LOCK_KEY = 0x6C696E65
SYNC_WINDOW_MINUTES = 5
WAL_WARN_BYTES = 64 * 1024 * 1024
OWNER = "Nền tảng Bamboo"

OPS_TABLES = ("wf.task", "wf.approval_history", "proc.purchase_request", "ic.ic_order", "mfg.lot", "core.org_unit")
CONSUMERS = {
    "app:bi": ("Phân tích BI", "Trang · Phân tích BI, API /api/v1/metrics", "/i/bi"),
    "app:ops": ("Trung tâm điều hành", "Trang · Trung tâm điều hành, API /api/v1/ops", "/d/ops"),
    "app:data-services": ("Dịch vụ dữ liệu", "Trang · Dịch vụ dữ liệu, API /api/v1/datasets", "/d/services"),
}


def silver_name(table: str) -> str:
    return table.replace(".", "_", 1)


def table_of(silver: str) -> str:
    return silver.replace("_", ".", 1)


def _label(table: str) -> str:
    return lakehouse_query.LABELS.get(silver_name(table), table)


def build_graph(published: set[str]) -> tuple[list[dict], list[dict]]:
    """Nút và cạnh `auto` từ danh sách bảng đang phát CDC. Hàm thuần, không đọc CSDL."""
    semantic_tables = {table_of(s): s for s in semantic.SOURCES}
    tables = sorted(set(OPS_TABLES) | set(semantic_tables))
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    def node(id_: str, layer: str, tech: str, name: str, fqn: str, title: str, **extra):
        nodes[id_] = {
            "id": id_,
            "layer": layer,
            "tech": tech,
            "name": name,
            "fqn": fqn,
            "title": title,
            "owner": extra.get("owner", OWNER),
            "used_by": extra.get("used_by"),
            "app_link": extra.get("app_link"),
        }

    def edge(a: str, b: str, columns: list[str] | None = None):
        edges.append({"from_node": a, "to_node": b, "columns": columns or []})

    for cid, (title, used_by, link) in CONSUMERS.items():
        node(cid, "consumer", "Ứng dụng", title, f"app.{cid[4:]}", title, used_by=used_by, app_link=link)

    for t in tables:
        src = f"pg:{t}"
        node(src, "source", "PostgreSQL", t, f"postgres.bms.{t}", _label(t))
        if t in OPS_TABLES:
            edge(src, "app:ops")
        if t not in published:
            continue
        topic = f"bms.{t}"
        stream = f"kafka:{t}"
        node(stream, "stream", "Kafka", topic, f"kafka.{topic}", f"CDC {_label(t).lower()} (Debezium)")
        edge(src, stream, ["mọi cột → after.*"])
        if not lakehouse_sink.TOPIC_PATTERN.match(topic):
            continue
        lake = f"lake:{t}"
        sv = silver_name(t)
        node(
            lake,
            "lake",
            "Iceberg",
            f"silver.{sv}",
            f"lakehouse.silver.{sv}",
            f"{_label(t)} (bronze → silver)",
            app_link=f"/d/services?dataset={sv}",
        )
        edge(stream, lake, ["after.* → cột có kiểu"])
        edge(lake, "app:data-services")

    for sv, spec in semantic.SOURCES.items():
        t = table_of(sv)
        sem = f"semantic:{sv}"
        node(
            sem,
            "serving",
            "Trino",
            f"semantic.{sv}",
            f"lakehouse.semantic.{sv}",
            f"Chỉ số: {spec['label']}",
            used_by=", ".join(m[0] for m in spec["measures"].values()),
        )
        if f"lake:{t}" in nodes:
            cols = [f"{spec['time']}→period"] + [f"{c}→{d}" for d, (_, c) in spec["dimensions"].items()]
            edge(f"lake:{t}", sem, cols)
        edge(sem, "app:bi")
    return list(nodes.values()), edges


def published_tables(conn: psycopg.Connection) -> set[str]:
    return {
        f"{r[0]}.{r[1]}"
        for r in conn.execute("SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'bms_cdc'")
    }


def save_graph(conn: psycopg.Connection, nodes: list[dict], edges: list[dict]) -> None:
    conn.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_KEY,))
    ids = [n["id"] for n in nodes]
    conn.execute("DELETE FROM meta.lineage_edge WHERE origin = 'auto'")
    conn.execute(
        """DELETE FROM meta.lineage_node n WHERE origin = 'auto' AND NOT (id = ANY(%s))
             AND NOT EXISTS (SELECT 1 FROM meta.data_issue i WHERE i.node_id = n.id)""",
        (ids,),
    )
    for n in nodes:
        conn.execute(
            """INSERT INTO meta.lineage_node (id, layer, tech, name, fqn, title, owner, used_by, app_link, origin)
               VALUES (%(id)s, %(layer)s, %(tech)s, %(name)s, %(fqn)s, %(title)s, %(owner)s, %(used_by)s, %(app_link)s,
                       'auto')
               ON CONFLICT (id) DO UPDATE SET layer = EXCLUDED.layer, tech = EXCLUDED.tech, name = EXCLUDED.name,
                   fqn = EXCLUDED.fqn, title = EXCLUDED.title, owner = EXCLUDED.owner, used_by = EXCLUDED.used_by,
                   app_link = EXCLUDED.app_link, origin = 'auto'""",
            n,
        )
    for e in edges:
        conn.execute(
            """INSERT INTO meta.lineage_edge (from_node, to_node, columns, origin) VALUES (%s, %s, %s, 'auto')
               ON CONFLICT (from_node, to_node) DO UPDATE SET columns = EXCLUDED.columns, origin = 'auto'""",
            (e["from_node"], e["to_node"], e["columns"]),
        )


def _check(conn, tenant, node_id: str, rule: str, name: str, passed: bool, detail: str) -> dict:
    conn.execute(
        "DELETE FROM meta.quality_check WHERE node_id = %s AND rule = %s AND tenant_id IS NOT DISTINCT FROM %s",
        (node_id, rule, tenant),
    )
    conn.execute(
        """INSERT INTO meta.quality_check (node_id, rule, name, passed, detail, checked_at, tenant_id)
           VALUES (%s, %s, %s, %s, %s, now(), %s)""",
        (node_id, rule, name, passed, detail, tenant),
    )
    return {"node_id": node_id, "rule": rule, "passed": passed, "detail": detail}


def check_slot(conn: psycopg.Connection, stream_nodes: list[str]) -> list[dict]:
    """Replication slot logic của Debezium: còn hoạt động và WAL chưa đọc dưới ngưỡng (mức nền tảng, tenant NULL)."""
    slot = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT slot_name, active, pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::bigint AS lag
           FROM pg_replication_slots WHERE slot_type = 'logical' AND database = current_database()
           ORDER BY active DESC, slot_name LIMIT 1"""
        )
        .fetchone()
    )
    if slot is None:
        passed, detail = False, "Chưa có replication slot: Debezium chưa chạy hoặc chưa kết nối"
    else:
        lag = int(slot["lag"] or 0)
        passed = bool(slot["active"]) and lag < WAL_WARN_BYTES
        detail = f"Slot {slot['slot_name']} {'đang đọc' if slot['active'] else 'không hoạt động'} · WAL chờ {lag / 1048576:.1f} MB"
    return [_check(conn, None, n, "cdc_slot", "Debezium đọc kịp WAL", passed, detail) for n in stream_nodes]


def _pg_counts(conn: psycopg.Connection, tenant: str, tables: list[str]) -> dict[str, tuple[int, int]]:
    """(số dòng của công ty, số dòng đổi trong SYNC_WINDOW_MINUTES phút) theo bảng."""
    out = {}
    for t in tables:
        schema, name = t.split(".", 1)
        cols = {
            r[0]
            for r in conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema = %s AND table_name = %s",
                (schema, name),
            )
        }
        if "tenant_id" not in cols:
            continue
        stamps = [c for c in ("updated_at", "created_at", "closed_at") if c in cols]
        recent = (
            " + ".join(
                f"count(*) FILTER (WHERE {c} > now() - make_interval(mins => {SYNC_WINDOW_MINUTES}))" for c in stamps
            )
            if stamps
            else "0"
        )
        row = conn.execute(
            sql.SQL("SELECT count(*), {} FROM {} WHERE tenant_id = %s").format(
                sql.SQL(recent), sql.Identifier(schema, name)
            ),
            (tenant,),
        ).fetchone()
        out[t] = (int(row[0]), int(row[1]))
    return out


def check_tenant(conn: psycopg.Connection, session: dict, ctx: Context, lake_tables: list[str]) -> tuple[list, str]:
    """Đối chiếu số dòng PostgreSQL ↔ silver cho công ty trong phiên; trả (kết quả, ghi chú khi bỏ qua)."""
    try:
        tenant, client = lakehouse_query._require(conn, session, ctx)
    except ActionError as exc:
        return [], exc.message
    pg = _pg_counts(conn, tenant, lake_tables)
    if not pg:
        return [], "Không có bảng nào để đối chiếu"
    query = " UNION ALL ".join(
        f"SELECT '{silver_name(t)}' AS t, count(*) AS n FROM {silver_name(t)}" for t in sorted(pg)
    )
    started = time.monotonic()
    try:
        _, rows = lakehouse_query._query(client, tenant, query)
    except (ActionError, TrinoError) as exc:
        return [], getattr(exc, "message", str(exc))
    duration = round(time.monotonic() - started)
    silver = {r[0]: int(r[1]) for r in rows}
    out = []
    for t, (n_pg, recent) in sorted(pg.items()):
        n_lake = silver.get(silver_name(t), 0)
        diff = abs(n_pg - n_lake)
        if diff == 0:
            passed, detail = True, f"Khớp · {n_pg} dòng"
        elif diff <= recent:
            passed, detail = True, f"Đang đồng bộ · PostgreSQL {n_pg}, silver {n_lake} ({recent} dòng vừa đổi)"
        else:
            passed, detail = False, f"Lệch {diff} dòng · PostgreSQL {n_pg}, silver {n_lake}"
        node = f"lake:{t}"
        out.append(_check(conn, tenant, node, "row_count_match", "Đủ dòng so với PostgreSQL", passed, detail))
        conn.execute(
            """INSERT INTO meta.pipeline_run (id, task, engine, node_id, started_at, duration_s, result, tenant_id)
               VALUES (gen_random_uuid()::text, %s, 'Trino', %s, now(), %s, %s, %s)""",
            (f"đối chiếu postgres ↔ silver.{silver_name(t)}", node, duration, "success" if passed else "check_failed",
             tenant),
        )  # fmt: skip
    conn.execute(
        """DELETE FROM meta.pipeline_run WHERE tenant_id = %s AND id NOT IN (
               SELECT id FROM meta.pipeline_run WHERE tenant_id = %s ORDER BY started_at DESC LIMIT 200)""",
        (tenant, tenant),
    )
    return out, ""


def auto_collect(conn: psycopg.Connection) -> dict:
    """Thu thập phả hệ và kiểm tra mức nền tảng theo lịch (không cần Trino); ghi một lần chạy cho mỗi luồng CDC."""
    started = time.monotonic()
    nodes, edges = build_graph(published_tables(conn))
    save_graph(conn, nodes, edges)
    streams = [n["id"] for n in nodes if n["layer"] == "stream"]
    checks = check_slot(conn, streams)
    failed = sum(not c["passed"] for c in checks)
    for node in streams[:1]:
        conn.execute(
            """INSERT INTO meta.pipeline_run (id, task, engine, node_id, started_at, duration_s, result, tenant_id)
               VALUES (gen_random_uuid()::text, 'lineage.auto', 'PostgreSQL', %s, now(), %s, %s, NULL)""",
            (node, max(0, round(time.monotonic() - started)), "check_failed" if failed else "success"),
        )
    conn.execute(
        """DELETE FROM meta.pipeline_run WHERE task = 'lineage.auto'
             AND started_at < now() - interval '7 days'"""
    )
    return {"nodes": len(nodes), "edges": len(edges), "checks": len(checks), "failed": failed}


def lineage_refresh(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> dict:
    if not session.get("x-hasura-tenant-id") or not session.get("x-hasura-user-id"):
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    nodes, edges = build_graph(published_tables(conn))
    save_graph(conn, nodes, edges)
    slot = check_slot(conn, [n["id"] for n in nodes if n["layer"] == "stream"])
    lake = [n["id"][5:] for n in nodes if n["layer"] == "lake"]
    tenant_checks, note = check_tenant(conn, session, ctx, lake)
    checks = slot + tenant_checks
    return {
        "nodes": len(nodes),
        "edges": len(edges),
        "checks": len(checks),
        "failed": sum(not c["passed"] for c in checks),
        "note": note or None,
    }


def _iso(rows: list[dict]) -> list[dict]:
    return [{**r, **{k: r[k].isoformat() for k in ("checked_at", "started_at") if k in r}} for r in rows]


def lineage_graph(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    """Đồ thị `auto` kèm kiểm tra và lần chạy của công ty trong phiên (cho API /api/v1/lineage)."""
    tenant = session.get("x-hasura-tenant-id")
    if not tenant:
        raise ActionError("Thiếu x-hasura-tenant-id", "unauthorized", 401)
    cur = conn.cursor(row_factory=dict_row)
    nodes = cur.execute(
        "SELECT id, layer, tech, name, fqn, title, owner, used_by FROM meta.lineage_node WHERE origin = 'auto' ORDER BY id"
    ).fetchall()
    edges = cur.execute(
        "SELECT from_node, to_node, columns FROM meta.lineage_edge WHERE origin = 'auto' ORDER BY 1, 2"
    ).fetchall()
    checks = cur.execute(
        """SELECT node_id, rule, name, passed, detail, checked_at FROM meta.quality_check
           WHERE tenant_id IS NULL OR tenant_id = %s ORDER BY checked_at DESC LIMIT 500""",
        (tenant,),
    ).fetchall()
    runs = cur.execute(
        """SELECT task, engine, node_id, started_at, duration_s, result FROM meta.pipeline_run
           WHERE tenant_id = %s ORDER BY started_at DESC LIMIT 50""",
        (tenant,),
    ).fetchall()
    return {"nodes": nodes, "edges": edges, "checks": _iso(checks), "runs": _iso(runs)}


HANDLERS = {"lineage_refresh": lineage_refresh, "lineage_graph": lineage_graph}
