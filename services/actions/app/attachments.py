"""Hasura Action cho tệp đính kèm (ADR #26). Lưu trữ và quét virus ở `storage.py`."""

import hashlib
import logging
import pathlib
import uuid

import psycopg

from . import storage
from .common import ActionError, Context, bind_session, require_read, session_identity

log = logging.getLogger("attachments")

_COLUMNS = "id, tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key, status, uploaded_by"


def _clean_name(file_name: str) -> str:
    name = pathlib.PurePosixPath((file_name or "").replace("\\", "/")).name.strip()
    name = "".join(ch for ch in name if ch.isprintable())
    if not name:
        raise ActionError("Tên tệp không hợp lệ")
    return name[:255]


def _load(conn: psycopg.Connection, session: dict, attachment_id: str, lock: bool = False) -> tuple[dict, str]:
    row = conn.execute(f"SELECT {_COLUMNS}, deleted_at FROM core.attachment WHERE id = %s"
                       + (" FOR UPDATE" if lock else ""), (attachment_id,)).fetchone()
    person = session_identity(session, row[1] if row else None)
    if row[-1] is not None:
        raise ActionError("Không tìm thấy tệp đính kèm", "not-found", 404)
    return dict(zip(_COLUMNS.split(", "), row)), person


def _require_storage(ctx: Context) -> storage.Storage:
    if ctx.storage is None:
        raise ActionError("Chưa cấu hình lưu trữ tệp", "unavailable", 503)
    return ctx.storage


def get_upload_url(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    s3 = _require_storage(ctx)
    entity_type, entity_id = args["entity_type"], args["entity_id"]
    content_type = (args.get("content_type") or "").split(";")[0].strip().lower()
    size = int(args["size_bytes"])
    if entity_type not in storage.ENTITY_TYPES:
        raise ActionError(f"Loại chứng từ không nhận tệp đính kèm: {entity_type}")
    if content_type not in storage.ALLOWED_TYPES:
        raise ActionError("Chỉ nhận PDF, ảnh PNG/JPEG, DOCX, XLSX, TXT", "file-type")
    if not 0 < size <= storage.MAX_BYTES:
        raise ActionError(f"Tệp phải nhỏ hơn {storage.MAX_BYTES // (1024 * 1024)} MB", "file-size")
    name = _clean_name(args["file_name"])

    tenant = conn.execute("SELECT collab.entity_tenant(%s, %s)", (entity_type, entity_id)).fetchone()[0]
    person = session_identity(session, tenant)
    require_read(conn, entity_type, entity_id, person)

    attachment_id = str(uuid.uuid4())
    key = f"{tenant}/{entity_type}/{entity_id}/{attachment_id}"
    bind_session(conn, session)
    conn.execute(
        """INSERT INTO core.attachment (tenant_id, id, entity_type, entity_id, file_name, content_type, size_bytes,
                                        storage_key, uploaded_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (tenant, attachment_id, entity_type, entity_id, name, content_type, size, key, person))
    return {"attachment_id": attachment_id, "upload_url": s3.upload_url(key, content_type), "method": "PUT",
            "content_type": content_type, "expires_in": storage.UPLOAD_TTL}


def _finish(conn, attachment_id: str, status: str, scan_result: str, sha256: str | None = None) -> dict:
    conn.execute("""UPDATE core.attachment SET status = %s, scan_result = %s, sha256 = %s, scanned_at = now()
                    WHERE id = %s""", (status, scan_result, sha256, attachment_id))
    return {"attachment_id": attachment_id, "status": status, "scan_result": scan_result}


def confirm_upload(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    """Kiểm tra tệp đã tải lên bucket cách ly; sạch thì chuyển sang bucket chính.
    Tệp sai khai báo hoặc nhiễm mã độc bị xóa ngay (trạng thái REJECTED / INFECTED)."""
    s3 = _require_storage(ctx)
    att, person = _load(conn, session, args["attachment_id"], lock=True)
    if att["uploaded_by"] != uuid.UUID(person):
        raise ActionError("Chỉ người tải lên được xác nhận tệp", "forbidden", 403)
    if att["status"] != "PENDING":
        return {"attachment_id": str(att["id"]), "status": att["status"],
                "scan_result": conn.execute("SELECT scan_result FROM core.attachment WHERE id = %s",
                                            (att["id"],)).fetchone()[0]}
    key, attachment_id = att["storage_key"], str(att["id"])
    data = s3.read_quarantine(key)
    if data is None:
        raise ActionError("Chưa nhận được tệp: tải tệp lên bằng upload_url trước", "not-uploaded")

    bind_session(conn, session)
    reason = None
    if len(data) != att["size_bytes"]:
        reason = f"Kích thước {len(data)} byte khác khai báo {att['size_bytes']} byte"
    elif not storage.content_matches(att["content_type"], data):
        reason = f"Nội dung không khớp loại tệp {att['content_type']}"
    if reason:
        s3.delete(key)
        return _finish(conn, attachment_id, "REJECTED", reason)

    digest = hashlib.sha256(data).hexdigest()
    if ctx.clamav_host:
        try:
            verdict, detail = storage.scan(data, ctx.clamav_host, ctx.clamav_port)
        except OSError as exc:
            # Không quét được thì giữ tệp ở bucket cách ly (PENDING), người dùng thử lại sau.
            log.warning("ClamAV lỗi: %s", exc)
            raise ActionError("Chưa quét được virus, thử lại sau", "scanner-unavailable", 503) from exc
    else:
        verdict, detail = "CLEAN", "bỏ qua: ClamAV chưa được cấu hình"
    if verdict == "INFECTED":
        s3.delete(key)
        return _finish(conn, attachment_id, "INFECTED", detail, digest)
    s3.promote(key, att["content_type"])
    return _finish(conn, attachment_id, "CLEAN", detail, digest)


def get_download_url(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    s3 = _require_storage(ctx)
    att, person = _load(conn, session, args["attachment_id"])
    require_read(conn, att["entity_type"], att["entity_id"], person)
    if att["status"] != "CLEAN":
        raise ActionError(f"Tệp ở trạng thái {att['status']} không tải về được", "not-clean")
    return {"attachment_id": str(att["id"]), "expires_in": storage.DOWNLOAD_TTL,
            "url": s3.download_url(att["storage_key"], att["file_name"], att["content_type"])}


def delete_attachment(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    s3 = _require_storage(ctx)
    att, person = _load(conn, session, args["attachment_id"], lock=True)
    if att["uploaded_by"] != uuid.UUID(person):
        raise ActionError("Chỉ người tải lên được xóa tệp", "forbidden", 403)
    bind_session(conn, session)
    conn.execute("UPDATE core.attachment SET deleted_at = now() WHERE id = %s", (att["id"],))
    s3.delete(att["storage_key"])
    return {"attachment_id": str(att["id"]), "status": "DELETED", "scan_result": None}
