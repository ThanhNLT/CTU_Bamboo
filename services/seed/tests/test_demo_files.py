# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

import csv
import filecmp
import json

from app import demo_files


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
    computed = {(k, t) for k, t in kpis if k in demo_files.COMPUTED_KPIS}
    assert computed and values == kpis - computed and pins <= kpis
