import argparse
import csv
import datetime as dt
import json
import pathlib
import random

OUT = pathlib.Path(__file__).resolve().parents[1] / "data" / "demo"
TZ = dt.timezone(dt.timedelta(hours=7))
REF = dt.datetime(2026, 10, 14, 10, 30, tzinfo=TZ)
STEP_MIN = 5
HOURS = 24
CONTEXT = [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld",
    "https://bamboo.local/context/ban-sao-so.jsonld",
]


def attr(key, label, unit, unit_code, decimals, base, noise, lo=None, hi=None, limit_label=None):
    return {
        "key": key,
        "label": label,
        "unit": unit,
        "unit_code": unit_code,
        "decimals": decimals,
        "min": lo,
        "max": hi,
        "limit_label": limit_label,
        "base": base,
        "noise": noise,
    }


BATTERY = attr("batteryLevel", "Pin dự phòng", "%", "P1", 0, 95, 0.5, lo=30)
BOARD = attr("boardTemperature", "Nhiệt độ bo mạch", "°C", "CEL", 0, 41, 1.5, hi=60)
WIFI = attr("wifiSignal", "Tín hiệu Wi-Fi", "dBm", None, 0, -58, 2, lo=-75)
LATENCY = attr("syncLatency", "Độ trễ đồng bộ", "ms", "C26", 0, 180, 25, hi=500)

MODELS = {
    "CleanRoom": {
        "kind": "Phòng sạch",
        "category": "cleanroom",
        "grade": "ISO 5",
        "attributes": [
            attr("particles05", "Hạt bụi ≥0,5 µm", "hạt/m³", None, 0, 1300, 70, hi=3520, limit_label="Ngưỡng ISO 5"),
            attr("particles5", "Hạt bụi ≥5 µm", "hạt/m³", None, 0, 10, 3, hi=29, limit_label="Ngưỡng ISO 5"),
            attr("differentialPressure", "Chênh áp", "Pa", "PAL", 0, 14, 0.8, lo=10),
            attr("temperature", "Nhiệt độ", "°C", "CEL", 1, 21.1, 0.25, lo=20, hi=22),
            attr("relativeHumidity", "Độ ẩm", "%", "P1", 0, 45, 1.2, lo=40, hi=50),
            attr("airVelocity", "Tốc độ gió", "m/s", "MTS", 2, 0.45, 0.02, lo=0.36, hi=0.54),
        ],
    },
    "SmtLine": {
        "kind": "Dây chuyền SMT",
        "category": "smt",
        "grade": "IPC-A-610 loại 2",
        "attributes": [
            attr("reflowPeakTemperature", "Nhiệt độ đỉnh lò reflow", "°C", "CEL", 0, 242, 2, lo=235, hi=250),
            attr("conveyorSpeed", "Tốc độ băng tải", "cm/phút", None, 0, 90, 1.5, lo=80, hi=100),
            attr("aoiDefectRate", "Tỷ lệ lỗi AOI", "%", "P1", 2, 0.18, 0.04, hi=0.5),
            attr("placementRate", "Tốc độ gắp đặt", "nghìn linh kiện/giờ", None, 0, 72, 2, lo=60),
            attr("floorHumidity", "Độ ẩm xưởng", "%", "P1", 0, 45, 1.5, lo=30, hi=60),
            attr("floorTemperature", "Nhiệt độ xưởng", "°C", "CEL", 1, 24, 0.3, lo=22, hi=26),
        ],
    },
    "Ventilator": {
        "kind": "Máy thở",
        "category": "medical",
        "grade": "TTBYT loại C",
        "attributes": [
            attr("airwayPressure", "Áp lực đường thở", "cmH₂O", None, 0, 18, 1.5, lo=5, hi=30),
            attr("oxygenFlow", "Lưu lượng O₂", "L/phút", "L2", 1, 6, 0.3, lo=2, hi=15),
            attr("gasTemperature", "Nhiệt độ khí thở", "°C", "CEL", 1, 34.5, 0.3, lo=32, hi=37),
            attr("leakRate", "Tỷ lệ rò rỉ", "%", "P1", 0, 4, 1, hi=10),
            BATTERY,
            BOARD,
        ],
    },
    "PatientMonitor": {
        "kind": "Máy theo dõi bệnh nhân",
        "category": "medical",
        "grade": "TTBYT loại B",
        "attributes": [
            BATTERY,
            BOARD,
            WIFI,
            LATENCY,
            attr("sensorErrorRate", "Lỗi cảm biến", "lần/giờ", None, 0, 0.6, 0.4, hi=3),
            attr("cpuLoad", "Tải CPU", "%", "P1", 0, 37, 4, hi=85),
        ],
    },
    "ColdStorage": {
        "kind": "Tủ bảo quản vắc-xin",
        "category": "medical",
        "grade": "TTBYT loại B",
        "attributes": [
            attr("temperature", "Nhiệt độ tủ", "°C", "CEL", 1, 4.6, 0.4, lo=2, hi=8),
            attr("relativeHumidity", "Độ ẩm", "%", "P1", 0, 52, 2, hi=70),
            attr("doorOpenings", "Số lần mở cửa", "lần/giờ", None, 0, 2, 0.8, hi=6),
            attr("supplyVoltage", "Điện áp nguồn", "V", "VLT", 0, 226, 2, lo=207, hi=242),
            {**BATTERY, "base": 94},
            attr("compressorDuty", "Tải máy nén", "%", "P1", 0, 46, 4, hi=80),
        ],
    },
    "InfusionPump": {
        "kind": "Bơm tiêm điện",
        "category": "medical",
        "grade": "TTBYT loại C",
        "attributes": [
            attr("occlusionPressure", "Áp lực tắc nghẽn", "mmHg", None, 0, 95, 8, hi=300),
            attr("flowDeviation", "Sai lệch lưu lượng", "%", "P1", 1, 1.6, 0.3, hi=5),
            {**BATTERY, "base": 76},
            {**BOARD, "base": 38},
            {**WIFI, "base": -61},
            {**LATENCY, "base": 210},
        ],
    },
}

SITES = [
    ("chip-bn", "TDX", "CHIP_PS", "Phòng sạch nhà máy chip Bắc Ninh", "Bắc Ninh", 21.18612, 106.07631),
    ("phone-tn", "TDX", "DT_NM", "Nhà máy lắp ráp Thái Nguyên", "Thái Nguyên", 21.59422, 105.84817),
    ("phone-bg", "TDX", "DT_NM", "Xưởng SMT Bắc Giang (Nhà máy lắp ráp)", "Bắc Giang", 21.27307, 106.19460),
    ("bv-cc", "BVX", "BVX_CC", "Khoa Cấp cứu – Bệnh viện X", "Hà Nội", 20.97136, 105.77876),
    ("bv-noi", "BVX", "BVX_NOI", "Khoa Nội – Bệnh viện X", "Hà Nội", 20.97136, 105.77876),
    ("bv-ngoai", "BVX", "BVX_NGOAI", "Khoa Ngoại – Bệnh viện X", "Hà Nội", 20.97136, 105.77876),
    ("bv-duoc", "BVX", "BVX_DUOC", "Kho vắc-xin Khoa Dược – Bệnh viện X", "Hà Nội", 20.97136, 105.77876),
]
SITE = {s[0]: s for s in SITES}

ENTITIES = [
    ("CR-01", "CleanRoom", "chip-bn", 0, {}),
    (
        "CR-02",
        "CleanRoom",
        "chip-bn",
        0,
        {
            "particles05": (2950, 3120, [(30, 13, 3660), (610, 596, 3600)], True),
            "particles5": (16, 18, [], False),
            "differentialPressure": (12, 8, [(34, None, 8)], False),
            "temperature": (21.3, 21.4, [], False),
            "airVelocity": (0.43, 0.42, [], False),
        },
    ),
    (
        "CR-03",
        "CleanRoom",
        "chip-bn",
        0,
        {"particles05": (2400, None, [], False), "relativeHumidity": (47, 52, [(50, None, 52)], False)},
    ),
    ("CR-04", "CleanRoom", "chip-bn", 2, {"particles05": (1600, None, [], False)}),
    ("SMT-BG-01", "SmtLine", "phone-bg", 0, {}),
    ("SMT-BG-02", "SmtLine", "phone-bg", 0, {}),
    ("SMT-BG-03", "SmtLine", "phone-bg", 0, {"aoiDefectRate": (0.2, 0.41, [(26, 9, 0.72)], True)}),
    ("SMT-BG-04", "SmtLine", "phone-bg", 0, {}),
    ("SMT-BG-05", "SmtLine", "phone-bg", 0, {"placementRate": (70, None, [], False)}),
    ("SMT-TN-01", "SmtLine", "phone-tn", 0, {}),
    ("SMT-TN-02", "SmtLine", "phone-tn", 0, {"reflowPeakTemperature": (244, 252, [(15, None, 252)], False)}),
    ("SMT-TN-03", "SmtLine", "phone-tn", 0, {}),
    ("MT-01", "Ventilator", "bv-cc", 0, {}),
    ("MT-02", "Ventilator", "bv-cc", 0, {}),
    ("MT-03", "Ventilator", "bv-noi", 0, {}),
    ("MT-04", "Ventilator", "bv-noi", 0, {"batteryLevel": (40, 24, [(40, None, 24)], False)}),
    ("MON-01", "PatientMonitor", "bv-cc", 0, {}),
    ("MON-02", "PatientMonitor", "bv-noi", 0, {}),
    ("MON-03", "PatientMonitor", "bv-noi", 0, {"wifiSignal": (-66, -79, [(20, None, -79)], False)}),
    ("MON-04", "PatientMonitor", "bv-ngoai", 0, {}),
    ("TL-01", "ColdStorage", "bv-duoc", 0, {}),
    (
        "TL-02",
        "ColdStorage",
        "bv-duoc",
        0,
        {"temperature": (4.8, 7.4, [(47, 25, 9.1)], True), "doorOpenings": (5, None, [], False)},
    ),
    ("TL-03", "ColdStorage", "bv-duoc", 0, {}),
    ("BT-01", "InfusionPump", "bv-ngoai", 0, {}),
    ("BT-02", "InfusionPump", "bv-ngoai", 6, {}),
    ("BT-03", "InfusionPump", "bv-cc", 0, {}),
]


def iso(t: dt.datetime) -> str:
    return t.isoformat(timespec="seconds")


def urn(entity_type: str, entity_id: str) -> str:
    return f"urn:ngsi-ld:{entity_type}:bamboo:{entity_id}"


def rnd(v: float, decimals: int) -> float | int:
    return round(v, decimals) if decimals else int(round(v))


def series(key: str, base: float, noise: float, excursions: list, pin, gap: int) -> list[tuple[int, float]]:
    rng = random.Random(key)
    e = 0.0
    out = []
    for m in range(HOURS * 60, -1, -STEP_MIN):
        e = 0.75 * e + rng.gauss(0, noise * 0.66)
        v = base + e
        for start, end, level in excursions:
            end = 0 if end is None else end
            if end <= m <= start:
                w = min(1.0, (start - m) / 3, (m - end) / 3 + 1 if end else 1.0)
                v = v * (1 - w) + (level + e * 0.5) * w
        out.append((m, v))
    if pin is not None:
        out[-1] = (0, pin)
    return [(m, v) for m, v in out if m >= gap or gap == 0]


def breaches(points: list[tuple[int, float]], lo, hi) -> list[dict]:
    spans, cur = [], None
    for m, v in points:
        side = "above" if hi is not None and v > hi else "below" if lo is not None and v < lo else None
        if side and cur and cur["side"] == side:
            cur["end"], cur["peak"] = m, (max if side == "above" else min)(cur["peak"], v)
        elif side:
            cur = {"side": side, "start": m, "end": m, "peak": v}
            spans.append(cur)
        else:
            cur = None
    return spans


def digital_twin(out: pathlib.Path) -> dict:
    d = out / "ban-sao-so"
    d.mkdir(parents=True, exist_ok=True)
    models = {
        t: {**{k: v for k, v in m.items() if k != "attributes"},
            "attributes": [{k: v for k, v in a.items() if k not in ("base", "noise")} for a in m["attributes"]]}
        for t, m in MODELS.items()
    }  # fmt: skip
    (d / "mo-hinh.json").write_text(json.dumps(models, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with (d / "co-so.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["site_id", "tenant", "org_unit_code", "name", "province", "lat", "lng"])
        w.writerows(SITES)

    entities, rows, incidents, signals = [], [], [], {}
    for eid, etype, site, offline, overrides in ENTITIES:
        model = MODELS[etype]
        tenant, unit = SITE[site][1], SITE[site][2]
        last_seen = REF - dt.timedelta(minutes=offline)
        ent = {
            "id": urn(etype, eid),
            "type": etype,
            "code": {"type": "Property", "value": eid},
            "name": {"type": "Property", "value": f"{model['kind']} {eid}"},
            "category": {"type": "Property", "value": model["category"]},
            "grade": {"type": "Property", "value": model["grade"]},
            "tenant": {"type": "Property", "value": tenant},
            "orgUnit": {"type": "Property", "value": unit},
            "site": {"type": "Relationship", "object": f"urn:ngsi-ld:Site:bamboo:{site}"},
            "connectionState": {
                "type": "Property",
                "value": "offline" if offline else "online",
                "observedAt": iso(last_seen),
            },
        }
        for a in model["attributes"]:
            base, pin, exc, incident = overrides.get(a["key"], (None, None, [], False))
            points = series(f"{eid}:{a['key']}", base if base is not None else a["base"], a["noise"], exc, pin, offline)
            points = [(m, rnd(v, a["decimals"])) for m, v in points]
            signals[(eid, a["key"])] = points
            for m, v in points:
                rows.append((iso(REF - dt.timedelta(minutes=m)), eid, a["key"], v))
            last_m, last_v = points[-1]
            ent[a["key"]] = {
                "type": "Property",
                "value": last_v,
                **({"unitCode": a["unit_code"]} if a["unit_code"] else {}),
                "unitText": a["unit"],
                "observedAt": iso(REF - dt.timedelta(minutes=last_m)),
            }
            for b in breaches(points, a["min"], a["max"]):
                open_ = b["end"] == points[-1][0] and not offline
                limit = a["max"] if b["side"] == "above" else a["min"]
                incidents.append(
                    {
                        "entity_id": eid,
                        "attribute": a["key"],
                        "label": a["label"],
                        "side": b["side"],
                        "threshold": limit,
                        "started_at": iso(REF - dt.timedelta(minutes=b["start"])),
                        "ended_at": "" if open_ else iso(REF - dt.timedelta(minutes=b["end"] - STEP_MIN)),
                        "minutes": b["start"] - b["end"] + (0 if open_ else STEP_MIN),
                        "peak": rnd(b["peak"], a["decimals"]),
                        "severity": "critical" if incident else "warning",
                        "status": "open" if open_ else "closed",
                    }
                )
        entities.append(ent)

    (d / "thuc-the.jsonld").write_text(
        json.dumps({"@context": CONTEXT, "@graph": entities}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    rows.sort()
    with (d / "do-luong.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["observed_at", "entity_id", "attribute", "value"])
        w.writerows(rows)
    incidents.sort(key=lambda i: (i["started_at"], i["entity_id"]))
    with (d / "su-co.csv").open("w", newline="", encoding="utf-8") as f:
        fields = ["incident_id", *incidents[0].keys()] if incidents else ["incident_id"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for n, i in enumerate(incidents, start=1):
            w.writerow({"incident_id": f"SC-{n:04d}", **i})
    return signals


NODES = [
    ("pg-purchase-request", "source", "PostgreSQL", "proc.purchase_request", "postgres.bms.proc.purchase_request",
     "Đề nghị mua sắm", "Nhóm quy trình", "", "/p/documents"),
    ("pg-approval-history", "source", "PostgreSQL", "wf.approval_history", "postgres.bms.wf.approval_history",
     "Lịch sử duyệt", "Nhóm quy trình", "", ""),
    ("pg-task", "source", "PostgreSQL", "wf.task", "postgres.bms.wf.task", "Việc duyệt", "Nhóm quy trình", "",
     "/p/tasks"),
    ("pg-lot", "source", "PostgreSQL", "mfg.lot", "postgres.bms.mfg.lot", "Lô sản xuất", "Nhóm sản xuất", "", ""),
    ("pg-org-unit", "source", "PostgreSQL", "core.org_unit", "postgres.bms.core.org_unit", "Cơ cấu tổ chức",
     "Nhóm nền tảng", "", "/admin/org"),
    ("ngsi-cleanroom", "source", "NGSI-LD", "CleanRoom", "ngsi-ld.bamboo.CleanRoom", "Phòng sạch (bản sao số)",
     "Nhóm OT · Chip X", "", "/d/twin?entity=CR-02"),
    ("ngsi-smt", "source", "NGSI-LD", "SmtLine", "ngsi-ld.bamboo.SmtLine", "Dây chuyền SMT (bản sao số)",
     "Nhóm OT · Điện thoại X", "", "/d/twin?entity=SMT-BG-03"),
    ("ngsi-cold", "source", "NGSI-LD", "ColdStorage", "ngsi-ld.bamboo.ColdStorage", "Tủ vắc-xin (bản sao số)",
     "Khoa Dược · Bệnh viện X", "", "/d/twin?entity=TL-02"),
    ("kafka-purchase-request", "stream", "Kafka", "bms.proc.purchase_request", "kafka.bms.proc.purchase_request",
     "CDC đề nghị mua sắm", "Nhóm dữ liệu", "", ""),
    ("kafka-approval-history", "stream", "Kafka", "bms.wf.approval_history", "kafka.bms.wf.approval_history",
     "CDC lịch sử duyệt", "Nhóm dữ liệu", "", ""),
    ("kafka-task", "stream", "Kafka", "bms.wf.task", "kafka.bms.wf.task", "CDC việc duyệt", "Nhóm dữ liệu", "", ""),
    ("kafka-lot", "stream", "Kafka", "bms.mfg.lot", "kafka.bms.mfg.lot", "CDC lô sản xuất", "Nhóm dữ liệu", "", ""),
    ("kafka-org-unit", "stream", "Kafka", "bms.core.org_unit", "kafka.bms.core.org_unit", "CDC cơ cấu tổ chức",
     "Nhóm dữ liệu", "", ""),
    ("kafka-iot", "stream", "Kafka", "iot.telemetry", "kafka.iot.telemetry", "Đo lường thiết bị", "Nhóm OT", "", ""),
    ("ice-purchase-request", "lake", "Iceberg", "silver.proc_purchase_request",
     "lakehouse.silver.proc_purchase_request", "Đề nghị mua sắm (silver)", "Nhóm dữ liệu", "",
     "/d/services"),
    ("ice-approval-history", "lake", "Iceberg", "silver.wf_approval_history", "lakehouse.silver.wf_approval_history",
     "Lịch sử duyệt (silver)", "Nhóm dữ liệu", "", "/d/services"),
    ("ice-task", "lake", "Iceberg", "silver.wf_task", "lakehouse.silver.wf_task", "Việc duyệt (silver)",
     "Nhóm dữ liệu", "", "/d/services"),
    ("ice-lot", "lake", "Iceberg", "silver.mfg_lot", "lakehouse.silver.mfg_lot", "Lô sản xuất (silver)",
     "Nhóm dữ liệu", "", "/d/services"),
    ("ice-org-unit", "lake", "Iceberg", "silver.core_org_unit", "lakehouse.silver.core_org_unit",
     "Cơ cấu tổ chức (silver)", "Nhóm dữ liệu", "", "/d/services"),
    ("ice-telemetry", "lake", "Iceberg", "silver.iot_telemetry_5m", "lakehouse.silver.iot_telemetry_5m",
     "Đo lường 5 phút (silver)", "Nhóm OT", "", ""),
    ("gold-approval-daily", "serving", "Trino", "gold.approval_daily", "lakehouse.gold.approval_daily",
     "Duyệt theo ngày, đơn vị", "Nhóm dữ liệu", "", ""),
    ("gold-smt-oee", "serving", "Trino", "gold.smt_oee_daily", "lakehouse.gold.smt_oee_daily", "OEE dây chuyền SMT",
     "Nhóm OT · Điện thoại X", "", ""),
    ("gold-cleanroom", "serving", "Trino", "gold.cleanroom_hourly", "lakehouse.gold.cleanroom_hourly",
     "Phòng sạch theo giờ", "Nhóm OT · Chip X", "", ""),
    ("gold-cold-chain", "serving", "Trino", "gold.cold_chain_daily", "lakehouse.gold.cold_chain_daily",
     "Chuỗi lạnh theo ngày (tổng hợp)", "Khoa Dược · Bệnh viện X", "", ""),
    ("kpi-on-time", "consumer", "KPI", "Duyệt đúng hạn", "kpi.on_time_rate", "Tỷ lệ duyệt đúng hạn", "Ban điều hành",
     "KPI · Trang chủ, Trung tâm điều hành", "/d/ops"),
    ("kpi-pr-value", "consumer", "KPI", "Giá trị mua sắm đã duyệt", "kpi.pr_approved_value",
     "Giá trị mua sắm đã duyệt", "Ban điều hành", "KPI · Trang chủ", "/d/ops"),
    ("kpi-oee", "consumer", "KPI", "OEE dây chuyền", "kpi.smt_oee", "OEE dây chuyền SMT", "Điện thoại X",
     "KPI · Trang chủ", "/d/twin?entity=SMT-BG-03"),
    ("kpi-particles", "consumer", "KPI", "Hạt bụi CR-02", "kpi.cleanroom_particles", "Hạt bụi ≥0,5 µm phòng CR-02",
     "Chip X", "KPI · Trang chủ", "/d/twin?entity=CR-02"),
    ("kpi-lots-on-hold", "consumer", "KPI", "Lô đang giữ", "kpi.lots_on_hold", "Số lô đang giữ", "Chip X",
     "KPI · Trang chủ, Trung tâm điều hành", "/d/ops"),
    ("kpi-cold-chain", "consumer", "KPI", "Tủ vắc-xin đạt nhiệt", "kpi.cold_chain_ok", "Tỷ lệ thời gian tủ đạt 2–8 °C",
     "Bệnh viện X", "KPI · Trang chủ", "/d/twin?entity=TL-02"),
    ("app-ops", "consumer", "Ứng dụng", "Trung tâm điều hành", "app.ops_dashboard", "Trung tâm điều hành",
     "Nhóm nền tảng", "Trang · Trung tâm điều hành", "/d/ops"),
    ("app-data-services", "consumer", "Ứng dụng", "Dịch vụ dữ liệu", "app.lakehouse_datasets", "Dịch vụ dữ liệu",
     "Nhóm dữ liệu", "Trang · Dịch vụ dữ liệu", "/d/services"),
]  # fmt: skip

EDGES = [
    ("pg-purchase-request", "kafka-purchase-request", "id→after.id; total_amount→after.total_amount"),
    ("pg-approval-history", "kafka-approval-history", "event→after.event; created_at→after.created_at"),
    ("pg-task", "kafka-task", "created_at→after.created_at; closed_at→after.closed_at"),
    ("pg-lot", "kafka-lot", "status→after.status"),
    ("pg-org-unit", "kafka-org-unit", "id→after.id; path→after.path"),
    ("ngsi-cleanroom", "kafka-iot", "particles05→value"),
    ("ngsi-smt", "kafka-iot", "aoiDefectRate→value; placementRate→value"),
    ("ngsi-cold", "kafka-iot", "temperature→value"),
    ("kafka-purchase-request", "ice-purchase-request", "after.total_amount→total_amount"),
    ("kafka-approval-history", "ice-approval-history", "after.event→event"),
    ("kafka-task", "ice-task", "after.closed_at→closed_at"),
    ("kafka-lot", "ice-lot", "after.status→status"),
    ("kafka-org-unit", "ice-org-unit", "after.path→path"),
    ("kafka-iot", "ice-telemetry", "value→avg_value"),
    ("ice-approval-history", "gold-approval-daily", "event→completed"),
    ("ice-task", "gold-approval-daily", "closed_at→on_time"),
    ("ice-purchase-request", "gold-approval-daily", "total_amount→approved_value"),
    ("ice-org-unit", "gold-approval-daily", "path→company"),
    ("ice-telemetry", "gold-smt-oee", "avg_value→oee"),
    ("ice-telemetry", "gold-cleanroom", "avg_value→particles05_p95"),
    ("ice-telemetry", "gold-cold-chain", "avg_value→minutes_in_range"),
    ("ice-lot", "kpi-lots-on-hold", "status→value"),
    ("gold-approval-daily", "kpi-on-time", "on_time→value"),
    ("gold-approval-daily", "kpi-pr-value", "approved_value→value"),
    ("gold-smt-oee", "kpi-oee", "oee→value"),
    ("gold-cleanroom", "kpi-particles", "particles05_p95→value"),
    ("gold-cold-chain", "kpi-cold-chain", "minutes_in_range→value"),
    ("kpi-on-time", "app-ops", ""),
    ("kpi-lots-on-hold", "app-ops", ""),
    ("ice-purchase-request", "app-data-services", ""),
    ("ice-lot", "app-data-services", ""),
]

CHECKS = [
    ("pg-purchase-request", "row_count > 0", "Có dữ liệu", True, "Đạt · 126 dòng", 12),
    ("pg-approval-history", "row_count > 0", "Có dữ liệu", True, "Đạt · 412 dòng", 12),
    ("pg-task", "schema unchanged", "Lược đồ không đổi", True, "Đạt", 12),
    ("pg-org-unit", "duplicate(code) = 0", "Mã đơn vị không trùng", True, "Đạt", 12),
    ("kafka-purchase-request", "consumer_lag < 1000", "Độ trễ tiêu thụ", True, "Đạt · lag 4", 3),
    ("kafka-approval-history", "consumer_lag < 1000", "Độ trễ tiêu thụ", True, "Đạt · lag 2", 3),
    ("kafka-task", "consumer_lag < 1000", "Độ trễ tiêu thụ", True, "Đạt · lag 1", 3),
    ("kafka-iot", "consumer_lag < 1000", "Độ trễ tiêu thụ", True, "Đạt · lag 37", 1),
    ("ice-task", "missing_count(closed_at) = 0 where status = 'DONE'", "closed_at không rỗng với việc đã xong",
     False, "Lỗi · 37 dòng rỗng", 15),
    ("ice-approval-history", "freshness(created_at) < 15m", "Dữ liệu mới", True, "Đạt · trễ 41 giây", 5),
    ("ice-lot", "invalid_count(status) = 0", "Trạng thái lô hợp lệ", True, "Đạt", 5),
    ("ice-telemetry", "freshness(observed_at) < 10m", "Dữ liệu mới", True, "Đạt · trễ 2 phút", 2),
    ("gold-approval-daily", "row_count > 0", "Có dữ liệu", True, "Đạt · 1.284 dòng", 10),
    ("gold-smt-oee", "avg(oee) between 0 and 1", "OEE trong khoảng 0–1", True, "Đạt", 10),
    ("gold-cleanroom", "row_count > 0", "Có dữ liệu", True, "Đạt · 2.304 dòng", 10),
    ("gold-cold-chain", "duplicate(day, device) = 0", "Không trùng ngày / thiết bị", True, "Đạt", 10),
]  # fmt: skip

RUNS = [
    ("cdc → bronze.wf_task", "lakehouse-sink", "ice-task", 16, 42, "success"),
    ("kiểm tra silver.wf_task", "Soda", "ice-task", 15, 9, "check_failed"),
    ("build gold.approval_daily", "Trino", "gold-approval-daily", 10, 74, "success"),
    ("iot.telemetry → silver.iot_telemetry_5m", "lakehouse-sink", "ice-telemetry", 5, 18, "success"),
    ("build gold.smt_oee_daily", "Trino", "gold-smt-oee", 4, 33, "success"),
    ("build gold.cleanroom_hourly", "Trino", "gold-cleanroom", 4, 21, "success"),
    ("build gold.cold_chain_daily", "Trino", "gold-cold-chain", 3, 12, "success"),
    ("build gold.approval_daily", "Trino", "gold-approval-daily", 1, 0, "running"),
]


def lineage(out: pathlib.Path) -> None:
    d = out / "pha-he-du-lieu"
    d.mkdir(parents=True, exist_ok=True)
    with (d / "nut.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["node_id", "layer", "tech", "name", "fqn", "title", "owner", "used_by", "app_link"])
        w.writerows(NODES)
    with (d / "canh.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["from_node", "to_node", "columns"])
        w.writerows(EDGES)
    with (d / "kiem-tra.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["node_id", "rule", "name", "passed", "detail", "checked_at"])
        for node, rule, name, passed, detail, ago in CHECKS:
            w.writerow([node, rule, name, str(passed).lower(), detail, iso(REF - dt.timedelta(minutes=ago))])
    with (d / "lan-chay.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["run_id", "task", "engine", "node_id", "started_at", "duration_s", "result"])
        for n, (task, engine, node, ago, secs, result) in enumerate(RUNS, start=1):
            w.writerow([f"R-{n:03d}", task, engine, node, iso(REF - dt.timedelta(minutes=ago)), secs, result])


KPIS = [
    ("on-time", "TDX", "Duyệt đúng hạn", "%", "up", 90, "day", "kpi-on-time",
     "Bước duyệt xong trong 48 giờ / mọi bước duyệt xong trong 30 ngày gần nhất, tính từ dữ liệu duyệt."),
    ("pr-value", "TDX", "Giá trị mua sắm đã duyệt", "tỷ đồng", "neutral", None, "month", "kpi-pr-value",
     "Tổng tiền đề nghị mua sắm duyệt xong trong tháng, tính từ dữ liệu duyệt."),
    ("lots-on-hold", "TDX", "Lô đang giữ", "lô", "down", 3, "week", "kpi-lots-on-hold",
     "Số lô ở trạng thái đang giữ; tuần hiện tại đếm trực tiếp từ bảng lô."),
    ("oee", "TDX", "OEE dây chuyền SMT", "%", "up", 75, "day", "kpi-oee",
     "Khả dụng × hiệu suất × chất lượng trung bình 8 dây chuyền SMT trong ngày."),
    ("particles", "TDX", "Hạt bụi ≥0,5 µm · CR-02", "hạt/m³", "down", 3520, "hour", "kpi-particles",
     "Trung bình mỗi giờ của hạt bụi ≥0,5 µm phòng sạch CR-02 (ngưỡng ISO 5)."),
    ("on-time", "BVX", "Duyệt đúng hạn", "%", "up", 90, "day", "kpi-on-time",
     "Bước duyệt xong trong 48 giờ / mọi bước duyệt xong trong 30 ngày gần nhất, tính từ dữ liệu duyệt."),
    ("cold-chain", "BVX", "Tủ vắc-xin đạt 2–8 °C", "%", "up", 99, "day", "kpi-cold-chain",
     "Tỷ lệ thời gian 3 tủ vắc-xin Khoa Dược ở 2–8 °C trong ngày."),
    ("ventilators", "BVX", "Máy thở sẵn sàng", "máy", "up", 4, "day", "",
     "Số máy thở trực tuyến, pin dự phòng ≥30% lúc 7 giờ sáng."),
]  # fmt: skip

PINS = [
    ("tgd", "TDX", ["on-time", "oee", "particles", "pr-value"]),
    ("cdo", "TDX", ["on-time", "lots-on-hold", "particles"]),
    ("gd.dienthoai", "TDX", ["oee", "on-time"]),
    ("nv.muahang.dienthoai", "TDX", ["on-time", "pr-value"]),
    ("tp.muahang.dienthoai", "TDX", ["on-time", "pr-value", "lots-on-hold"]),
    ("gd.benhvien", "BVX", ["cold-chain", "ventilators", "on-time"]),
]


COMPUTED_KPIS = {"on-time", "pr-value"}


def kpi_values(signals: dict) -> list[tuple]:
    rows = []
    for key, tenant, *_rest, grain, _node, _def in KPIS:
        if key in COMPUTED_KPIS:
            continue
        rng = random.Random(f"kpi:{tenant}:{key}")
        if grain == "hour":
            pts = signals[("CR-02", "particles05")]
            for h in range(12, 0, -1):
                window = [v for m, v in pts if (h - 1) * 60 <= m < h * 60]
                rows.append((key, tenant, grain, iso(REF - dt.timedelta(hours=h)), round(sum(window) / len(window))))
            continue
        n, step = (14, dt.timedelta(days=1)) if grain == "day" else (12, None)
        for i in range(n):
            if grain == "month":
                y, m = divmod(REF.month - 1 - (n - 1 - i), 12)
                at = dt.datetime(REF.year + y, m + 1, 1, tzinfo=TZ)
            elif grain == "week":
                at = REF.replace(hour=0, minute=0, second=0) - dt.timedelta(weeks=n - 1 - i, days=REF.weekday())
            else:
                at = REF.replace(hour=0, minute=0, second=0) - step * (n - 1 - i)
            t = i / (n - 1)
            if key == "lots-on-hold":
                v = max(0, round(1 + 2 * t + rng.gauss(0, 0.7)))
            elif key == "oee":
                v = round(78 - (6 if i == n - 1 else 0) + rng.gauss(0, 1.2), 1)
            elif key == "cold-chain":
                v = round(100 - (1.5 if i == n - 1 else 0) - abs(rng.gauss(0, 0.2)), 1)
            else:
                v = 4 if i < n - 1 else 3
            rows.append((key, tenant, grain, iso(at), v))
    return rows


def kpis(out: pathlib.Path, signals: dict) -> None:
    d = out / "kpi"
    d.mkdir(parents=True, exist_ok=True)
    with (d / "dinh-nghia.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["kpi_key", "tenant", "label", "unit", "good_direction", "threshold", "grain", "lineage_node",
                    "definition"])  # fmt: skip
        w.writerows(["" if v is None else v for v in k] for k in KPIS)
    with (d / "gia-tri.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["kpi_key", "tenant", "grain", "period_start", "value"])
        w.writerows(kpi_values(signals))
    with (d / "ghim.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["username", "tenant", "kpi_key", "position"])
        for user, tenant, keys in PINS:
            w.writerows((user, tenant, k, i) for i, k in enumerate(keys, start=1))


def generate(out: pathlib.Path = OUT) -> None:
    signals = digital_twin(out)
    lineage(out)
    kpis(out, signals)


def main() -> None:
    p = argparse.ArgumentParser(
        description="Sinh tệp dữ liệu demo cho nhóm 5: Bản sao số, Phả hệ dữ liệu, KPI ghim Trang chủ."
    )
    p.add_argument("--out", type=pathlib.Path, default=OUT)
    out = p.parse_args().out
    generate(out)
    print(f"đã ghi dữ liệu demo nhóm 5 vào {out}")


if __name__ == "__main__":
    main()
