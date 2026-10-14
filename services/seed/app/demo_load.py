# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import argparse
import csv
import datetime as dt
import json
import logging
import os
import pathlib

import psycopg

from .demo import DEMO_USERS, uid
from .demo_files import OUT as DATA
from .demo_files import REF

log = logging.getLogger("seed")
STEP = dt.timedelta(minutes=5)


def _rows(path: pathlib.Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def shift_of(now: dt.datetime) -> dt.timedelta:
    delta = now - REF
    return delta - dt.timedelta(seconds=delta.total_seconds() % STEP.total_seconds())


def _at(value: str, shift: dt.timedelta) -> dt.datetime | None:
    return dt.datetime.fromisoformat(value) + shift if value else None


def _person(username: str):
    user = next(u for u in DEMO_USERS if u.username == username)
    return user.id


def load_twin(conn: psycopg.Connection, shift: dt.timedelta) -> int:
    d = DATA / "ban-sao-so"
    models = json.loads((d / "mo-hinh.json").read_text(encoding="utf-8"))
    for t, m in models.items():
        conn.execute(
            """INSERT INTO iot.model (type, kind, category, grade, attributes) VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (type) DO UPDATE SET kind = EXCLUDED.kind, category = EXCLUDED.category,
                                               grade = EXCLUDED.grade, attributes = EXCLUDED.attributes""",
            (t, m["kind"], m["category"], m["grade"], json.dumps(m["attributes"], ensure_ascii=False)),
        )
    for s in _rows(d / "co-so.csv"):
        conn.execute(
            """INSERT INTO iot.site (tenant_id, code, org_unit_id, name, province, lat, lng)
               VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
            (uid("tenant", s["tenant"]), s["site_id"], uid(s["tenant"], "unit", s["org_unit_code"]), s["name"],
             s["province"], s["lat"], s["lng"]),
        )  # fmt: skip
    graph = json.loads((d / "thuc-the.jsonld").read_text(encoding="utf-8"))["@graph"]
    ids = {}
    for e in graph:
        code, tenant = e["code"]["value"], e["tenant"]["value"]
        ids[code] = (uid("tenant", tenant), uid(tenant, "iot", code))
        conn.execute(
            """INSERT INTO iot.entity (tenant_id, id, code, urn, type, name, site_code, org_unit_id, connection_state)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (*ids[code], code, e["id"], e["type"], e["name"]["value"], e["site"]["object"].rsplit(":", 1)[1],
             uid(tenant, "unit", e["orgUnit"]["value"]), e["connectionState"]["value"]),
        )  # fmt: skip
    rows = _rows(d / "do-luong.csv")
    with conn.cursor().copy(
        "COPY iot.measurement (tenant_id, entity_id, attribute, observed_at, value) FROM STDIN"
    ) as copy:
        for r in rows:
            copy.write_row((*ids[r["entity_id"]], r["attribute"], _at(r["observed_at"], shift), float(r["value"])))
    for i in _rows(d / "su-co.csv"):
        conn.execute(
            """INSERT INTO iot.incident (tenant_id, code, entity_id, attribute, side, threshold, started_at, ended_at,
                                         minutes, peak, severity, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (*ids[i["entity_id"]][:1], i["incident_id"], ids[i["entity_id"]][1], i["attribute"], i["side"],
             float(i["threshold"]), _at(i["started_at"], shift), _at(i["ended_at"], shift), int(i["minutes"]),
             float(i["peak"]), i["severity"], i["status"]),
        )  # fmt: skip
    return len(rows)


def load_lineage(conn: psycopg.Connection, shift: dt.timedelta) -> None:
    d = DATA / "pha-he-du-lieu"
    for n in _rows(d / "nut.csv"):
        conn.execute(
            """INSERT INTO meta.lineage_node (id, layer, tech, name, fqn, title, owner, used_by, app_link)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (n["node_id"], n["layer"], n["tech"], n["name"], n["fqn"], n["title"], n["owner"], n["used_by"] or None,
             n["app_link"] or None),
        )  # fmt: skip
    for e in _rows(d / "canh.csv"):
        cols = [c.strip() for c in e["columns"].split(";") if c.strip()]
        conn.execute(
            "INSERT INTO meta.lineage_edge (from_node, to_node, columns) VALUES (%s, %s, %s)",
            (e["from_node"], e["to_node"], cols),
        )
    for c in _rows(d / "kiem-tra.csv"):
        conn.execute(
            """INSERT INTO meta.quality_check (node_id, rule, name, passed, detail, checked_at)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (c["node_id"], c["rule"], c["name"], c["passed"] == "true", c["detail"], _at(c["checked_at"], shift)),
        )
    for r in _rows(d / "lan-chay.csv"):
        conn.execute(
            """INSERT INTO meta.pipeline_run (id, task, engine, node_id, started_at, duration_s, result)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (r["run_id"], r["task"], r["engine"], r["node_id"], _at(r["started_at"], shift), int(r["duration_s"]),
             r["result"]),
        )  # fmt: skip


def load_kpi(conn: psycopg.Connection, shift: dt.timedelta) -> None:
    d = DATA / "kpi"
    for k in _rows(d / "dinh-nghia.csv"):
        conn.execute(
            """INSERT INTO kpi.definition (tenant_id, key, label, unit, good_direction, threshold, grain,
                                           lineage_node, definition)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (uid("tenant", k["tenant"]), k["kpi_key"], k["label"], k["unit"], k["good_direction"],
             float(k["threshold"]) if k["threshold"] else None, k["grain"], k["lineage_node"] or None,
             k["definition"]),
        )  # fmt: skip
    for v in _rows(d / "gia-tri.csv"):
        at = _at(v["period_start"], shift if v["grain"] in ("hour", "day") else dt.timedelta(0))
        if v["grain"] == "day":
            at = at.replace(hour=0, minute=0)
        conn.execute(
            """INSERT INTO kpi.value (tenant_id, kpi_key, period_start, value) VALUES (%s, %s, %s, %s)
               ON CONFLICT DO NOTHING""",
            (uid("tenant", v["tenant"]), v["kpi_key"], at, float(v["value"])),
        )
    for p in _rows(d / "ghim.csv"):
        conn.execute(
            """INSERT INTO kpi.pin (tenant_id, person_id, kpi_key, position)
               SELECT %s, p.id, %s, %s FROM core.person p WHERE p.id = %s ON CONFLICT DO NOTHING""",
            (uid("tenant", p["tenant"]), p["kpi_key"], int(p["position"]), _person(p["username"])),
        )


def clear(conn: psycopg.Connection) -> None:
    conn.execute("DELETE FROM kpi.pin; DELETE FROM kpi.value; DELETE FROM kpi.definition")
    conn.execute("DELETE FROM meta.data_issue; DELETE FROM meta.lineage_node")
    conn.execute("DELETE FROM iot.entity; DELETE FROM iot.site")


def load(conn: psycopg.Connection, now: dt.datetime | None = None) -> bool:
    if conn.execute("SELECT 1 FROM iot.entity LIMIT 1").fetchone():
        return False
    shift = shift_of(now or dt.datetime.now(dt.UTC))
    n = load_twin(conn, shift)
    load_lineage(conn, shift)
    load_kpi(conn, shift)
    log.info("đã nạp dữ liệu demo nhóm 5: %d số đo, dời %s", n, shift)
    return True


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(
        description="Nạp tệp dữ liệu demo nhóm 5 (services/seed/data/demo) vào CSDL: Bản sao số (iot), Phả hệ dữ liệu (meta), KPI ghim Trang chủ (kpi)."
    )
    p.add_argument("--refresh", action="store_true", help="xóa dữ liệu demo nhóm 5 rồi nạp lại theo giờ hiện tại")
    args = p.parse_args()
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.transaction():
        if args.refresh:
            clear(conn)
        load(conn)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
