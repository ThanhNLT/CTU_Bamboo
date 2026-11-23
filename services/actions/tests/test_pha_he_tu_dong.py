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

"""Phả hệ dữ liệu thu tự động (ADR #64): đồ thị dựng từ publication CDC, Lakehouse, lớp ngữ nghĩa."""

import psycopg

from app import lineage_sync, semantic
from app.common import Context
from conftest import TEST_APP_DB_URL, ids


def test_do_thi_tu_publication_va_lop_ngu_nghia():
    published = {"wf.task", "proc.purchase_request", "ic.ic_order", "kpi.snapshot", "core.org_unit"}
    nodes, edges = lineage_sync.build_graph(published)
    by_id = {n["id"]: n for n in nodes}
    pairs = {(e["from_node"], e["to_node"]) for e in edges}
    assert ("pg:proc.purchase_request", "kafka:proc.purchase_request") in pairs
    assert ("kafka:proc.purchase_request", "lake:proc.purchase_request") in pairs
    assert ("lake:proc.purchase_request", "semantic:proc_purchase_request") in pairs
    assert ("semantic:proc_purchase_request", "app:bi") in pairs
    assert ("pg:wf.task", "app:ops") in pairs, "Trung tâm điều hành đọc thẳng PostgreSQL"
    assert "kafka:wf.approval_history" not in by_id, "bảng không phát CDC thì không có nút Kafka"
    assert "kafka:kpi.snapshot" in by_id and "lake:kpi.snapshot" not in by_id
    assert {f"semantic:{s}" for s in semantic.SOURCES} <= set(by_id)
    assert all(a in by_id and b in by_id for a, b in pairs), "mọi cạnh nối hai nút có thật"
    assert len(pairs) == len(edges), "không lặp cạnh"


def test_thu_thap_ghi_do_thi_auto_giu_do_thi_mau(conn):
    conn.execute(
        """INSERT INTO meta.lineage_node (id, layer, tech, name, fqn, title, owner)
           VALUES ('demo-x', 'source', 'PostgreSQL', 'x', 'demo.x', 'Mẫu', 'Nhóm') ON CONFLICT DO NOTHING"""
    )
    i = ids(conn, "TDX", "c")
    session = {"x-hasura-role": "user", "x-hasura-user-id": i["c"], "x-hasura-tenant-id": i["TDX"]}
    for _ in range(2):
        with psycopg.connect(TEST_APP_DB_URL) as c, c.transaction():
            out = lineage_sync.lineage_refresh(c, session, {}, Context())
    assert out["nodes"] > 10 and out["note"], "không có Lakehouse thì ghi chú lý do bỏ qua đối chiếu"
    auto = conn.execute("SELECT count(*) AS n FROM meta.lineage_node WHERE origin = 'auto'").fetchone()["n"]
    assert auto == out["nodes"]
    assert conn.execute("SELECT 1 FROM meta.lineage_node WHERE id = 'demo-x' AND origin = 'demo'").fetchone()
    slot = conn.execute(
        "SELECT passed, detail FROM meta.quality_check WHERE rule = 'cdc_slot' AND tenant_id IS NULL LIMIT 1"
    ).fetchone()
    assert slot is not None and "slot" in slot["detail"].lower()

    with psycopg.connect(TEST_APP_DB_URL) as c, c.transaction():
        graph = lineage_sync.lineage_graph(c, session, {}, Context())
    assert len(graph["nodes"]) == auto and graph["edges"]
    assert all(ch["checked_at"].endswith("+00:00") or "T" in ch["checked_at"] for ch in graph["checks"])
    conn.execute("DELETE FROM meta.lineage_node WHERE id = 'demo-x'")


def test_thu_thap_tu_dong_theo_lich_khong_can_trino(conn):
    with psycopg.connect(TEST_APP_DB_URL) as c, c.transaction():
        out = lineage_sync.auto_collect(c)
    assert out["nodes"] > 10 and out["checks"] >= 1
    run = conn.execute(
        """SELECT engine, result, tenant_id FROM meta.pipeline_run WHERE task = 'lineage.auto'
           ORDER BY started_at DESC LIMIT 1"""
    ).fetchone()
    assert run is not None and run["engine"] == "PostgreSQL" and run["tenant_id"] is None, "mức nền tảng"
    assert run["result"] == ("check_failed" if out["failed"] else "success")
    auto = conn.execute("SELECT count(*) AS n FROM meta.lineage_node WHERE origin = 'auto'").fetchone()["n"]
    assert auto == out["nodes"], "đồ thị dựng lại từ cấu hình đang chạy"
