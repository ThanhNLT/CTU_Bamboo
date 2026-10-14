# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Tệp dữ liệu demo nhóm 5 (services/seed/data/demo) phải khớp kết quả của app.demo_files, và nhất quán với nhau."""

# ===== Thư viện chuẩn =====
import csv
import filecmp
import json

# ===== Module nội bộ =====
from app import demo_files


# ===== Kịch bản kiểm thử =====
def test_tep_da_commit_khop_script(tmp_path):
    demo_files.generate(tmp_path)
    for f in sorted(p for p in tmp_path.rglob("*") if p.is_file()):
        rel = f.relative_to(tmp_path)
        assert filecmp.cmp(f, demo_files.OUT / rel, shallow=False), f"chạy lại: python -m app.demo_files ({rel})"


def test_du_lieu_nhat_quan():
    out = demo_files.OUT
    graph = json.loads((out / "ban-sao-so/thuc-the.jsonld").read_text(encoding="utf-8"))["@graph"]
    codes = {e["code"]["value"] for e in graph}
    assert len(graph) == 26
    sites = {r["site_id"] for r in csv.DictReader((out / "ban-sao-so/co-so.csv").open(encoding="utf-8"))}
    assert {e["site"]["object"].rsplit(":", 1)[1] for e in graph} <= sites
    incidents = list(csv.DictReader((out / "ban-sao-so/su-co.csv").open(encoding="utf-8")))
    assert {i["entity_id"] for i in incidents} <= codes
    assert any(i["entity_id"] == "CR-02" and i["severity"] == "critical" for i in incidents)

    nodes = {r["node_id"] for r in csv.DictReader((out / "pha-he-du-lieu/nut.csv").open(encoding="utf-8"))}
    for r in csv.DictReader((out / "pha-he-du-lieu/canh.csv").open(encoding="utf-8")):
        assert r["from_node"] in nodes and r["to_node"] in nodes
    checks = list(csv.DictReader((out / "pha-he-du-lieu/kiem-tra.csv").open(encoding="utf-8")))
    assert {c["node_id"] for c in checks} <= nodes and any(c["passed"] == "false" for c in checks)

    kpis = {(r["kpi_key"], r["tenant"]) for r in csv.DictReader((out / "kpi/dinh-nghia.csv").open(encoding="utf-8"))}
    values = {(r["kpi_key"], r["tenant"]) for r in csv.DictReader((out / "kpi/gia-tri.csv").open(encoding="utf-8"))}
    pins = {(r["kpi_key"], r["tenant"]) for r in csv.DictReader((out / "kpi/ghim.csv").open(encoding="utf-8"))}
    assert values == kpis and pins <= kpis
