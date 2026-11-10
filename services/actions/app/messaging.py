# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

"""Hành động cho kênh thông báo ngoài ứng dụng và hàng đợi tin nhắn."""

import json
import uuid

import psycopg
from psycopg.rows import dict_row

from . import delivery, receipts
from .common import ActionError, Context, bind_session, session_identity

CHANNELS = ("EMAIL", "SMS", "WEBHOOK")
KINDS = {
    "TASK_ASSIGNED": "Có việc mới giao cho tôi",
    "REQUEST_APPROVED": "Đề nghị của tôi được duyệt",
    "REQUEST_REJECTED": "Đề nghị của tôi bị từ chối",
    "REQUEST_RETURNED": "Đề nghị của tôi bị trả về",
    "REQUEST_CANCELLED": "Đề nghị bị hủy",
    "COMMENT": "Bình luận mới",
    "MENTION": "Có người nhắc đến tôi",
    "HR_DECISION": "Quyết định nhân sự về tôi",
    "PROCESS_PUBLISHED": "Quy trình mới được phát hành",
    "PROCESS_CHANGE_REQUESTED": "Yêu cầu sửa quy trình",
    "PROCESS_CHANGE_RESOLVED": "Yêu cầu sửa quy trình đã được xử lý",
    "PROCESS_AUTOMATION": "Thông báo từ quy trình tự động",
    "IC_ORDER_NEW": "Đơn hàng nội bộ mới",
    "CHAT_MESSAGE": "Có tin nhắn riêng khi tôi không mở ứng dụng",
    "CALENDAR_INVITE": "Được mời tham dự lịch công tác",
    "CALENDAR_REMINDER": "Nhắc lịch công tác sắp đến",
    "CALENDAR_CHANGED": "Lịch tôi tham dự đổi giờ hoặc bị hủy",
    "PROJECT_TASK": "Được giao việc hoặc thêm vào dự án",
    "PROJECT_REPORT": "Có báo cáo tiến độ dự án mới",
    "AI_AGENT": "Tác tử AI báo về chứng từ liên quan đến tôi",
}


def _who(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    bind_session(conn, session)
    return person, tenant


def _admin(conn: psycopg.Connection, session: dict) -> tuple[str, str]:
    person, tenant = _who(conn, session)
    ok = conn.execute(
        "SELECT core.has_permission(%s, 'core.org.manage', wf.root_unit(%s))", (person, tenant)
    ).fetchone()[0]
    if not ok:
        raise ActionError("Cần quyền core.org.manage để xem hàng đợi tin nhắn", "forbidden", 403)
    return person, tenant


def _channel(value: str) -> str:
    channel = str(value or "").upper()
    if channel not in CHANNELS:
        raise ActionError("Kênh chỉ gồm EMAIL, SMS hoặc WEBHOOK")
    return channel


def notification_prefs(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    rows = {
        r[0]: r
        for r in conn.execute(
            """SELECT channel, enabled, address, kinds FROM collab.notification_pref
               WHERE tenant_id = %s AND person_id = %s""",
            (tenant, person),
        ).fetchall()
    }
    channels = []
    for channel in CHANNELS:
        row = rows.get(channel)
        channels.append(
            {
                "channel": channel,
                "configured": channel in ctx.channels,
                "enabled": bool(row and row[1]),
                "address": row[2] if row else "",
                "kinds": list(row[3]) if row and row[3] else None,
            }
        )
    return {"channels": channels, "kinds": [{"code": k, "label": v} for k, v in KINDS.items()]}


def save_notification_pref(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    channel = _channel(args["channel"])
    address = str(args.get("address") or "").strip()
    kinds = args.get("kinds")
    if kinds is not None:
        kinds = [str(k) for k in kinds]
        unknown = [k for k in kinds if k not in KINDS]
        if unknown:
            raise ActionError(f"Loại thông báo không hợp lệ: {unknown[0]}")
        kinds = kinds or None
    if channel == "WEBHOOK":
        try:
            delivery.resolve_public(address)
        except delivery.DeliveryError as exc:
            if exc.permanent:
                raise ActionError(str(exc)) from exc
    try:
        conn.execute(
            """INSERT INTO collab.notification_pref (tenant_id, person_id, channel, enabled, address, kinds)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (tenant_id, person_id, channel)
               DO UPDATE SET enabled = EXCLUDED.enabled, address = EXCLUDED.address, kinds = EXCLUDED.kinds,
                             updated_at = now()""",
            (tenant, person, channel, bool(args.get("enabled", True)), address, kinds),
        )
    except psycopg.errors.CheckViolation as exc:
        hints = {
            "EMAIL": "Email không đúng định dạng",
            "SMS": "Số điện thoại gồm 8–15 chữ số, có thể bắt đầu bằng +",
            "WEBHOOK": "Webhook phải là địa chỉ https",
        }
        raise ActionError(hints[channel]) from exc
    return {"channel": channel}


def delete_notification_pref(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    channel = _channel(args["channel"])
    conn.execute(
        "DELETE FROM collab.notification_pref WHERE tenant_id = %s AND person_id = %s AND channel = %s",
        (tenant, person, channel),
    )
    return {"channel": channel}


def send_test_notification(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant = _who(conn, session)
    channel = _channel(args["channel"])
    if channel not in ctx.channels:
        raise ActionError(f"Kênh {channel} chưa được cấu hình trên máy chủ", "unavailable", 503)
    row = conn.execute(
        "SELECT address FROM collab.notification_pref WHERE tenant_id = %s AND person_id = %s AND channel = %s",
        (tenant, person, channel),
    ).fetchone()
    if row is None:
        raise ActionError("Lưu địa chỉ nhận trước khi gửi thử")
    message_id = conn.execute(
        "SELECT msg.enqueue(%s, %s, %s::jsonb, %s, %s, 2)",
        (
            tenant,
            f"notify.{channel.lower()}",
            json.dumps(
                {
                    "recipient_id": person,
                    "address": row[0],
                    "kind": "TEST",
                    "title": "Thông báo thử từ Bamboo DX-OS",
                    "body": "Nếu nhận được tin này, kênh đã cấu hình đúng.",
                    "entity_type": None,
                    "entity_id": None,
                },
                ensure_ascii=False,
            ),
            f"test:{person}:{channel}:{uuid.uuid4()}",
            person,
        ),
    ).fetchone()[0]
    return {"id": str(message_id), "status": "PENDING"}


def my_deliveries(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> list[dict]:
    person, tenant = _who(conn, session)
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT id, topic, status, attempts, last_error, payload ->> 'title' AS title, payload ->> 'address' AS address,
                  to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') AS created_at,
                  to_char(delivered_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') AS delivered_at
           FROM msg.queue WHERE tenant_id = %s AND payload ->> 'recipient_id' = %s
           ORDER BY created_at DESC LIMIT 20""",
            (tenant, person),
        )
        .fetchall()
    )
    return [
        {
            **r,
            "id": str(r["id"]),
            "channel": r["topic"].removeprefix("notify.").upper(),
            "address": delivery.mask(r["address"] or ""),
        }
        for r in rows
    ]


def queue_overview(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    _, tenant = _admin(conn, session)
    cur = conn.cursor(row_factory=dict_row)
    counts = cur.execute(
        "SELECT topic, status, count(*)::int AS n FROM msg.queue WHERE tenant_id = %s GROUP BY topic, status ORDER BY 1, 2",
        (tenant,),
    ).fetchall()
    rows = cur.execute(
        """SELECT id, topic, status, attempts, max_attempts, last_error, payload ->> 'title' AS title,
                  payload ->> 'address' AS address, receipt ->> 'alg' AS alg,
                  to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') AS created_at,
                  to_char(delivered_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') AS delivered_at
           FROM msg.queue WHERE tenant_id = %s
           ORDER BY (status = 'DEAD') DESC, (status IN ('PENDING', 'LEASED')) DESC, created_at DESC LIMIT 60""",
        (tenant,),
    ).fetchall()
    return {
        "counts": counts,
        "messages": [{**r, "id": str(r["id"]), "address": delivery.mask(r["address"] or "")} for r in rows],
    }


def queue_retry(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    _, tenant = _admin(conn, session)
    if not conn.execute("SELECT 1 FROM msg.queue WHERE id = %s AND tenant_id = %s", (args["id"], tenant)).fetchone():
        raise ActionError("Không tìm thấy tin nhắn", "not-found", 404)
    try:
        conn.execute("SELECT msg.retry(%s)", (args["id"],))
    except psycopg.errors.RaiseException as exc:
        raise ActionError(str(exc).splitlines()[0]) from exc
    return {"id": str(args["id"]), "status": "PENDING"}


def queue_verify(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    """Kiểm tra biên nhận: chữ ký hợp lệ và gắn đúng với nội dung đã gửi (mã băm)."""
    _, tenant = _admin(conn, session)
    row = conn.execute(
        "SELECT id, payload, payload_sha256, receipt FROM msg.queue WHERE id = %s AND tenant_id = %s",
        (args["id"], tenant),
    ).fetchone()
    if row is None:
        raise ActionError("Không tìm thấy tin nhắn", "not-found", 404)
    message_id, _payload, digest, receipt = row
    if receipt is None:
        return {"id": str(message_id), "valid": False, "reason": "Tin chưa được giao nên chưa có biên nhận"}
    hash_ok = conn.execute(
        "SELECT payload_sha256 = encode(sha256(convert_to(payload::text, 'UTF8')), 'hex') FROM msg.queue WHERE id = %s",
        (message_id,),
    ).fetchone()[0]
    signature_ok = ctx.signer is not None and receipts.verify_receipt(ctx.signer, str(message_id), digest, receipt)
    reason = None
    if not hash_ok:
        reason = "Nội dung tin không còn khớp mã băm đã ghi"
    elif not signature_ok:
        reason = "Chữ ký biên nhận không khớp hoặc không xác minh được"
    return {
        "id": str(message_id),
        "valid": bool(hash_ok and signature_ok),
        "reason": reason,
        "alg": receipt.get("alg"),
        "delivered_at": receipt.get("delivered_at"),
        "payload_sha256": digest,
    }


HANDLERS = {
    "notification_prefs": notification_prefs,
    "save_notification_pref": save_notification_pref,
    "delete_notification_pref": delete_notification_pref,
    "send_test_notification": send_test_notification,
    "my_deliveries": my_deliveries,
    "queue_overview": queue_overview,
    "queue_retry": queue_retry,
    "queue_verify": queue_verify,
}
