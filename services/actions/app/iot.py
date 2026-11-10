"""Hội tụ IT/OT (ADR #74): số đo thiết bị theo NGSI-LD, qua MQTT (iot-bridge) hoặc REST (cổng API).

- `parse_attrs`: nhận thân NGSI-LD dạng chuẩn (`{"temperature": {"type": "Property", "value": 21.3, "observedAt": …}}`)
  hoặc dạng gọn (`{"temperature": 21.3, "observedAt": …}`), gom theo thời điểm đo.
- `entity_ngsi`: thực thể bản sao số ra NGSI-LD dạng chuẩn (`/api/v1/ngsi-ld/v1/entities`).
- Action: iot_entities (đọc), iot_ingest (ghi, cần quyền iot.ingest ở đơn vị của thiết bị), iot_mqtt_account_create /
  iot_mqtt_account_revoke (quản trị viên công ty; mật khẩu hiện một lần, chỉ Mosquitto giữ bản băm).
"""

import datetime as dt
import logging
import re
import secrets

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from . import mqtt_admin
from .common import ActionError, Context, bind_session, session_identity

log = logging.getLogger("iot")

CONTEXT = [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld",
    "https://bamboo.local/context/ban-sao-so.jsonld",
]
SKIP_KEYS = {"id", "type", "@context", "observedAt"}
MAX_ATTRS = 50
MAX_ENTITIES = 500
_LABEL = re.compile(r"^[\w .:()/#-]{1,80}$", re.UNICODE)


def _time(value) -> dt.datetime | None:
    if value in (None, ""):
        return None
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ActionError(f"observedAt không đúng ISO-8601: {value}") from exc
    if parsed.tzinfo is None:
        raise ActionError("observedAt phải có múi giờ")
    return parsed


def parse_attrs(body) -> list[tuple[dt.datetime | None, dict]]:
    """Thân NGSI-LD → [(thời điểm đo hoặc None = bây giờ, {thuộc tính: số})], gom theo thời điểm đo."""
    if not isinstance(body, dict):
        raise ActionError("Thân số đo phải là đối tượng JSON")
    default = _time(body.get("observedAt"))
    groups: dict[dt.datetime | None, dict] = {}
    for key, raw in body.items():
        if key in SKIP_KEYS:
            continue
        observed = default
        if isinstance(raw, dict):
            if raw.get("type", "Property") != "Property" or "value" not in raw:
                raise ActionError(f"{key}: chỉ nhận Property có value")
            observed = _time(raw.get("observedAt")) or default
            raw = raw["value"]
        if isinstance(raw, bool) or not isinstance(raw, (int, float)):
            raise ActionError(f"Giá trị của {key} phải là số")
        groups.setdefault(observed, {})[key] = raw
    if not groups:
        raise ActionError("Không có thuộc tính số đo nào")
    if sum(len(v) for v in groups.values()) > MAX_ATTRS:
        raise ActionError(f"Tối đa {MAX_ATTRS} thuộc tính mỗi lần gửi")
    return sorted(groups.items(), key=lambda g: g[0] or dt.datetime.max.replace(tzinfo=dt.UTC))


def ingest(conn: psycopg.Connection, tenant: str, entity: str, body, source: str) -> int:
    total = 0
    for observed, values in parse_attrs(body):
        total += conn.execute(
            "SELECT iot.ingest(%s, %s, %s, coalesce(%s, now()), %s)", (tenant, entity, Jsonb(values), observed, source)
        ).fetchone()[0]
    return total


def entity_ngsi(row: dict, meta: dict[str, dict]) -> dict:
    out = {
        "id": row["urn"],
        "type": row["type"],
        "name": {"type": "Property", "value": row["name"]},
        "code": {"type": "Property", "value": row["code"]},
        "connectionState": {"type": "Property", "value": row["connection_state"]},
        "dataSource": {"type": "Property", "value": row["live_source"] or "demo"},
        "site": {"type": "Relationship", "object": f"urn:ngsi-ld:Site:bamboo:{row['site_code']}"},
        "@context": CONTEXT,
    }
    for key, state in sorted((row["state"] or {}).items()):
        attr = meta.get(key, {})
        out[key] = {
            "type": "Property",
            "value": state.get("value"),
            "observedAt": state.get("observed_at"),
            **({"unitCode": attr["unit_code"]} if attr.get("unit_code") else {}),
            **({"unitText": attr["unit"]} if attr.get("unit") else {}),
        }
    return out


def _tenant(session: dict) -> tuple[str, str]:
    tenant = session.get("x-hasura-tenant-id")
    return session_identity(session, tenant), tenant


def iot_entities(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _tenant(session)
    bind_session(conn, session)
    where, params = ["e.tenant_id = %s"], [tenant]
    if args.get("type"):
        where.append("e.type = %s")
        params.append(args["type"])
    if args.get("id"):
        where.append("(e.urn = %s OR e.code = %s)")
        params += [args["id"], args["id"]]
    limit = min(int(args.get("limit") or 100), MAX_ENTITIES)
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            f"""SELECT e.urn, e.code, e.type, e.name, e.site_code, e.connection_state, e.live_source, e.state,
                       m.attributes
                FROM iot.entity e JOIN iot.model m ON m.type = e.type
                WHERE {" AND ".join(where)} ORDER BY e.code LIMIT %s""",
            (*params, limit),
        )
        .fetchall()
    )
    if args.get("id") and not rows:
        raise ActionError("Không tìm thấy thực thể", "not-found", 404)
    return {"entities": [entity_ngsi(r, {a["key"]: a for a in r["attributes"]}) for r in rows]}


def iot_ingest(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    """Ghi số đo của một thiết bị qua REST (cổng API phạm vi iot.write)."""
    person, tenant = _tenant(session)
    entity = str(args.get("entity") or "").strip()
    row = conn.execute(
        "SELECT org_unit_id FROM iot.entity WHERE tenant_id = %s AND (code = %s OR urn = %s)", (tenant, entity, entity)
    ).fetchone()
    if row is None:
        raise ActionError("Không tìm thấy thiết bị", "not-found", 404)
    if not conn.execute("SELECT core.has_permission(%s, 'iot.ingest', %s)", (person, row[0])).fetchone()[0]:
        raise ActionError("Người tạo khóa không có quyền iot.ingest ở đơn vị của thiết bị", "forbidden", 403)
    bind_session(conn, session)
    return {"entity": entity, "written": ingest(conn, tenant, entity, args.get("attrs"), "api")}


def _require_admin(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    person, tenant = _tenant(session)
    if not conn.execute(
        "SELECT 1 FROM core.v_admin WHERE tenant_id = %s AND person_id = %s", (tenant, person)
    ).fetchone():
        raise ActionError("Chỉ quản trị viên công ty quản lý tài khoản thiết bị", "forbidden", 403)
    return person, tenant


def _mqtt(ctx: Context) -> mqtt_admin.Dynsec:
    if ctx.mqtt is None:
        raise ActionError("Chưa bật broker MQTT (MQTT_HOST)", "unavailable", 503)
    return ctx.mqtt


def iot_mqtt_account_create(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant = _require_admin(conn, session)
    label = str(args.get("label") or "").strip()
    if not _LABEL.match(label):
        raise ActionError("Tên gợi nhớ 1–80 ký tự, không ký tự đặc biệt")
    code = conn.execute("SELECT code FROM core.tenant WHERE id = %s", (tenant,)).fetchone()[0]
    if (
        conn.execute(
            "SELECT count(*) FROM iot.mqtt_account WHERE tenant_id = %s AND revoked_at IS NULL", (tenant,)
        ).fetchone()[0]
        >= 50
    ):
        raise ActionError("Tối đa 50 tài khoản thiết bị đang dùng mỗi công ty")
    username, password = mqtt_admin.new_username(code), secrets.token_urlsafe(24)
    bind_session(conn, session)
    conn.execute(
        "INSERT INTO iot.mqtt_account (tenant_id, username, label, created_by) VALUES (%s, %s, %s, %s)",
        (tenant, username, label, person),
    )
    try:
        _mqtt(ctx).create_device(code, username, password, label)
    except mqtt_admin.MqttUnavailable as exc:
        raise ActionError(str(exc), "unavailable", 503) from exc
    return {
        "username": username,
        "password": password,
        "topic": f"{mqtt_admin.TOPIC_ROOT}/{code}/<mã thiết bị>/attrs",
        "message": "Lưu mật khẩu ngay: hệ thống không hiện lại",
    }


def iot_mqtt_account_revoke(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant = _require_admin(conn, session)
    username = str(args.get("username") or "")
    bind_session(conn, session)
    row = conn.execute(
        """UPDATE iot.mqtt_account SET revoked_at = now(), revoked_by = %s
           WHERE tenant_id = %s AND username = %s AND revoked_at IS NULL RETURNING username""",
        (person, tenant, username),
    ).fetchone()
    if row is None:
        raise ActionError("Không tìm thấy tài khoản thiết bị đang dùng", "not-found", 404)
    try:
        _mqtt(ctx).delete_device(username)
    except mqtt_admin.MqttUnavailable as exc:
        raise ActionError(str(exc), "unavailable", 503) from exc
    return {"username": username, "revoked": True}


HANDLERS = {
    "iot_entities": iot_entities,
    "iot_ingest": iot_ingest,
    "iot_mqtt_account_create": iot_mqtt_account_create,
    "iot_mqtt_account_revoke": iot_mqtt_account_revoke,
}
