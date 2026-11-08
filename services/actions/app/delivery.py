"""Giao thông báo ra ngoài ứng dụng (email, SMS, webhook) từ hàng đợi `msg.queue`.

Worker nhận tin theo hợp đồng thuê (lease), gửi, rồi ghi biên nhận có chữ ký; lỗi tạm thì lùi dần và thử lại, lỗi
vĩnh viễn (địa chỉ sai, bị từ chối) hoặc hết lượt thì vào hàng chết để người quản trị xem và đưa lại.
"""

import datetime as dt
import ipaddress
import json
import logging
import smtplib
import socket
import ssl
import threading
import time
import urllib.parse
from email.message import EmailMessage
from email.utils import make_msgid

import httpx
import psycopg
from psycopg.rows import dict_row

from . import config, receipts

log = logging.getLogger("delivery")

LINKS = {
    "proc.purchase_request": "/p/purchase-requests/show/{id}",
    "hr.onboarding_request": "/h/onboarding/show/{id}",
    "hr.transfer_request": "/h/transfer/show/{id}",
    "ic.ic_order": "/p/ic-orders/show/{id}",
    "collab.kb_document": "/h/library/proposals/{id}",
    "wf.process_model": "/p/process?id={id}",
    "hr.personnel_decision": "/h/decisions",
    "chat.conversation": "/h/chat/{id}",
    "cal.event": "/h/calendar?event={id}",
    "pm.project": "/p/projects/{id}",
}
CHANNELS = ("email", "sms", "webhook")


class DeliveryError(Exception):
    def __init__(self, message: str, permanent: bool = False):
        super().__init__(message)
        self.permanent = permanent


def link_for(settings: config.Settings, payload: dict) -> str:
    template = LINKS.get(payload.get("entity_type") or "")
    if not template or not payload.get("entity_id"):
        return settings.web_origin
    return settings.web_origin.rstrip("/") + template.format(id=payload["entity_id"])


def mask(address: str) -> str:
    if "@" in address:
        user, _, host = address.partition("@")
        return f"{user[:1]}***@{host}"
    return f"{address[:3]}***{address[-2:]}" if len(address) > 6 else "***"


def send_email(settings: config.Settings, payload: dict) -> str:
    if not settings.smtp_host:
        raise DeliveryError("SMTP chưa được cấu hình (SMTP_HOST)", permanent=True)
    msg = EmailMessage()
    message_id = make_msgid(domain="bamboo.local")
    msg["Message-ID"], msg["From"], msg["To"] = message_id, settings.smtp_from, payload["address"]
    msg["Subject"] = payload["title"][:200]
    link = link_for(settings, payload)
    body = (payload.get("body") or "").strip()
    msg.set_content("\n\n".join(filter(None, [payload["title"], body, f"Mở trong Bamboo DX-OS: {link}"])))
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except smtplib.SMTPRecipientsRefused as exc:
        raise DeliveryError(f"Địa chỉ nhận bị từ chối: {mask(payload['address'])}", permanent=True) from exc
    except smtplib.SMTPResponseException as exc:
        raise DeliveryError(
            f"SMTP {exc.smtp_code}", permanent=500 <= exc.smtp_code < 600 and exc.smtp_code != 552
        ) from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise DeliveryError(f"Không gửi được qua SMTP: {type(exc).__name__}") from exc
    return message_id


def send_sms(settings: config.Settings, payload: dict) -> str:
    if not settings.sms_gateway_url:
        raise DeliveryError("Cổng SMS chưa được cấu hình (SMS_GATEWAY_URL)", permanent=True)
    headers = {"Authorization": f"Bearer {settings.sms_gateway_token}"} if settings.sms_gateway_token else {}
    text = f"{payload['title']} {link_for(settings, payload)}"[:300]
    try:
        resp = httpx.post(
            settings.sms_gateway_url, json={"to": payload["address"], "text": text}, headers=headers, timeout=15
        )
    except httpx.HTTPError as exc:
        raise DeliveryError(f"Không gọi được cổng SMS: {type(exc).__name__}") from exc
    if resp.status_code >= 500 or resp.status_code in (408, 429):
        raise DeliveryError(f"Cổng SMS trả {resp.status_code}")
    if resp.status_code >= 400:
        raise DeliveryError(f"Cổng SMS từ chối ({resp.status_code})", permanent=True)
    try:
        data = resp.json()
    except ValueError:
        data = {}
    return str(data.get("id") or data.get("message_id") or f"http-{resp.status_code}")


def resolve_public(url: str, allow_private: bool = False) -> tuple[str, str, str]:
    """Phân giải địa chỉ webhook và từ chối địa chỉ nội bộ (SSRF). Trả về (host, ip, đường dẫn đầy đủ)."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise DeliveryError("Webhook phải dùng https", permanent=True)
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise DeliveryError(f"Không phân giải được tên miền {parts.hostname}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not allow_private and (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise DeliveryError("Webhook trỏ tới địa chỉ nội bộ nên bị chặn", permanent=True)
    return parts.hostname, infos[0][4][0], url


def pinned_request(
    method: str, url: str, payload: dict | None, allow_private: bool = False, timeout: float = 10
) -> httpx.Response:
    """Gọi https tới địa chỉ công khai: kết nối thẳng tới IP đã kiểm tra, không theo chuyển hướng."""
    host, ip, url = resolve_public(url, allow_private)
    parts = urllib.parse.urlsplit(url)
    literal = f"[{ip}]" if ":" in ip else ip
    target = urllib.parse.urlunsplit(
        (parts.scheme, f"{literal}:{parts.port}" if parts.port else literal, parts.path, parts.query, "")
    )
    options = {
        "headers": {"Host": host},
        "timeout": timeout,
        "follow_redirects": False,
        "extensions": {"sni_hostname": host},
    }
    try:
        if method == "POST":
            return httpx.post(target, json=payload, **options)
        return httpx.get(target, **options)
    except httpx.HTTPError as exc:
        raise DeliveryError(f"Không gọi được {host}: {type(exc).__name__}") from exc


def send_webhook(settings: config.Settings, payload: dict) -> str:
    body = {
        "kind": payload["kind"],
        "title": payload["title"],
        "body": payload.get("body"),
        "link": link_for(settings, payload),
        "notification_id": payload.get("notification_id"),
    }
    resp = pinned_request("POST", payload["address"], body, settings.webhook_allow_private)
    if resp.status_code >= 500 or resp.status_code in (408, 429):
        raise DeliveryError(f"Webhook trả {resp.status_code}")
    if resp.status_code >= 300:
        raise DeliveryError(f"Webhook từ chối ({resp.status_code})", permanent=True)
    return f"http-{resp.status_code}"


SENDERS = {"email": send_email, "sms": send_sms, "webhook": send_webhook}


def deliver_one(conn: psycopg.Connection, settings: config.Settings, signer: receipts.Signer, message: dict) -> str:
    channel = message["topic"].removeprefix("notify.")
    sender = SENDERS.get(channel)
    try:
        if sender is None:
            raise DeliveryError(f"Chưa hỗ trợ kênh {channel}", permanent=True)
        provider_id = sender(settings, message["payload"])
    except DeliveryError as exc:
        status = conn.execute("SELECT msg.fail(%s, %s, %s) AS s", (message["id"], str(exc), exc.permanent)).fetchone()[
            "s"
        ]
        conn.commit()
        log.warning("giao %s %s: %s (%s)", channel, message["id"], exc, status)
        return status
    except Exception as exc:  # noqa: BLE001
        status = conn.execute("SELECT msg.fail(%s, %s) AS s", (message["id"], f"Lỗi không rõ: {exc}")).fetchone()["s"]
        conn.commit()
        log.exception("giao %s %s lỗi", channel, message["id"])
        return status
    delivered_at = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    receipt = receipts.make_receipt(
        signer, str(message["id"]), message["payload_sha256"], channel, delivered_at, provider_id
    )
    conn.execute("SELECT msg.complete(%s, %s::jsonb)", (message["id"], json.dumps(receipt)))
    conn.commit()
    return "DELIVERED"


def run_once(conn: psycopg.Connection, settings: config.Settings, signer: receipts.Signer, limit: int = 20) -> int:
    messages = conn.execute(
        "SELECT * FROM msg.lease('notify.', %s, %s)", (f"delivery-{threading.get_ident()}", limit)
    ).fetchall()
    conn.commit()
    for message in messages:
        deliver_one(conn, settings, signer, message)
    return len(messages)


def run_forever(settings: config.Settings, interval: float = 2.0) -> None:
    signer = receipts.Signer.from_env(settings.actions_secret)
    conn = psycopg.connect(settings.database_url, row_factory=dict_row)
    log.info("giao thông báo ngoài ứng dụng đang chạy")
    while True:
        try:
            while run_once(conn, settings, signer):
                pass
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            log.warning("vòng giao tin lỗi: %s", exc)
        time.sleep(interval)


def start_background(settings: config.Settings) -> threading.Thread:
    thread = threading.Thread(target=run_forever, args=(settings,), name="message-delivery", daemon=True)
    thread.start()
    return thread
