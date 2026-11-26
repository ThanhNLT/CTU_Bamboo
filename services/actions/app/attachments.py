# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import hashlib
import json
import logging
import pathlib
import threading
import time
import uuid

import psycopg

from bamboo_common import scanner

from . import cdr, storage
from .common import ActionError, Context, bind_session, require_read, session_identity

log = logging.getLogger("attachments")

_COLUMNS = (
    "id, tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key, status, uploaded_by, "
    "scan_engines"
)


def _clean_name(file_name: str) -> str:
    name = pathlib.PurePosixPath((file_name or "").replace("\\", "/")).name.strip()
    name = "".join(ch for ch in name if ch.isprintable())
    if not name:
        raise ActionError("Tên tệp không hợp lệ")
    return name[:255]


def _load(conn: psycopg.Connection, session: dict, attachment_id: str, lock: bool = False) -> tuple[dict, str]:
    row = conn.execute(
        f"SELECT {_COLUMNS}, deleted_at FROM core.attachment WHERE id = %s" + (" FOR UPDATE" if lock else ""),
        (attachment_id,),
    ).fetchone()
    person = session_identity(session, row[1] if row else None)
    if row[-1] is not None:
        raise ActionError("Không tìm thấy tệp đính kèm", "not-found", 404)
    return dict(zip(_COLUMNS.split(", "), row[:-1], strict=True)), person


def _gb(n: int) -> str:
    return f"{n / 1024**3:.2f}".replace(".", ",") + " GB"


def _require_storage(ctx: Context) -> storage.Storage:
    if ctx.storage is None:
        raise ActionError("Chưa cấu hình lưu trữ tệp", "unavailable", 503)
    return ctx.storage


def check_quota(conn: psycopg.Connection, tenant: str, person: str, size: int) -> None:
    """Chặn khi tệp mới vượt hạn mức của đơn vị hoặc của tài khoản tải lên (ADR #88).

    Khóa dòng tenant để hai lần tải đồng thời không cùng lọt qua hạn mức.
    """
    quota, user_quota = conn.execute(
        "SELECT storage_quota_bytes, user_storage_quota_bytes FROM core.tenant WHERE id = %s FOR UPDATE", (tenant,)
    ).fetchone()
    used = conn.execute("SELECT core.storage_used(%s)", (tenant,)).fetchone()[0]
    if used + size > quota:
        raise ActionError(
            f"Vượt hạn mức dung lượng của đơn vị: còn {_gb(max(quota - used, 0))} trên {_gb(quota)}", "file-quota"
        )
    mine = conn.execute("SELECT core.storage_used_by(%s, %s)", (tenant, person)).fetchone()[0]
    if mine + size > user_quota:
        raise ActionError(
            f"Vượt hạn mức dung lượng của tài khoản: còn {_gb(max(user_quota - mine, 0))} trên {_gb(user_quota)}",
            "file-quota",
        )


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
    check_quota(conn, tenant, person, size)

    attachment_id = str(uuid.uuid4())
    key = f"{tenant}/{entity_type}/{entity_id}/{attachment_id}"
    bind_session(conn, session)
    conn.execute(
        """INSERT INTO core.attachment (tenant_id, id, entity_type, entity_id, file_name, content_type, size_bytes,
                                        storage_key, uploaded_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (tenant, attachment_id, entity_type, entity_id, name, content_type, size, key, person),
    )
    return {
        "attachment_id": attachment_id,
        "upload_url": s3.upload_url(key, content_type),
        "method": "PUT",
        "content_type": content_type,
        "expires_in": storage.UPLOAD_TTL,
    }


def _finish(
    conn,
    attachment_id: str,
    status: str,
    scan_result: str,
    sha256: str | None = None,
    engines: list[str] | None = None,
    report: dict | None = None,
) -> dict:
    conn.execute(
        """UPDATE core.attachment SET status = %s, scan_result = %s, sha256 = %s, scan_engines = %s,
                  scan_report = %s::jsonb, scanned_at = now() WHERE id = %s""",
        (
            status,
            scan_result,
            sha256,
            engines or [],
            json.dumps(report, ensure_ascii=False) if report else None,
            attachment_id,
        ),
    )
    return {"attachment_id": attachment_id, "status": status, "scan_result": scan_result}


def scan_content(
    content_type: str, data: bytes, clamav_host: str = "", clamav_port: int = 3310, require_clamav: bool = False
) -> tuple[str, str, list[str], dict]:
    """Quét một tệp bằng mọi công cụ đang bật; chỉ trả CLEAN khi mọi công cụ đã quét xong và không thấy gì.

    Trả về (kết luận, mô tả, các công cụ đã quét, báo cáo). Công cụ bắt buộc mà không chạy được thì báo lỗi, không bao
    giờ bỏ qua để coi tệp là sạch.
    """
    if require_clamav and not clamav_host:
        raise ActionError(
            "Chưa cấu hình ClamAV nhưng hệ thống yêu cầu quét bằng ClamAV (SCAN_REQUIRE_CLAMAV)",
            "scanner-unavailable",
            503,
        )
    report = scanner.scan_file(content_type, data)
    if clamav_host:
        try:
            verdict, detail = storage.scan(data, clamav_host, clamav_port)
        except (OSError, RuntimeError) as exc:
            log.warning("ClamAV lỗi: %s", exc)
            raise ActionError("Chưa quét được virus, thử lại sau", "scanner-unavailable", 503) from exc
        report.engines.append(storage.clamav_label(clamav_host, clamav_port))
        report.checked.append("ClamAV: đối chiếu cơ sở dữ liệu mẫu virus")
        if verdict == "INFECTED":
            report.findings.insert(0, scanner.Finding("infected", "clamav", detail))
    verdict = report.verdict
    summary = report.summary()
    if verdict == "CLEAN" and clamav_host:
        summary = f"Đã quét xong, không phát hiện vấn đề ({'; '.join(report.engines)})"
    return verdict, summary, report.engines, report.as_dict()


def confirm_upload(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    s3 = _require_storage(ctx)
    att, person = _load(conn, session, args["attachment_id"], lock=True)
    if att["uploaded_by"] != uuid.UUID(person):
        raise ActionError("Chỉ người tải lên được xác nhận tệp", "forbidden", 403)
    if att["status"] != "PENDING":
        return {
            "attachment_id": str(att["id"]),
            "status": att["status"],
            "scan_result": conn.execute(
                "SELECT scan_result FROM core.attachment WHERE id = %s", (att["id"],)
            ).fetchone()[0],
        }
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
    verdict, detail, engines, report = scan_content(
        att["content_type"], data, ctx.clamav_host, ctx.clamav_port, ctx.require_clamav
    )
    if verdict != "CLEAN":
        s3.delete(key)
        return _finish(conn, attachment_id, verdict, detail, digest, engines, report)
    try:
        clean = disarm(att["content_type"], data, digest, report)
    except cdr.CdrError as exc:
        s3.delete(key)
        return _finish(conn, attachment_id, "REJECTED", str(exc), digest, engines, report)
    if clean is None:
        s3.promote(key, att["content_type"])
    else:
        s3.replace_from_quarantine(key, clean, att["content_type"])
        conn.execute("UPDATE core.attachment SET size_bytes = %s WHERE id = %s", (len(clean), attachment_id))
        digest = hashlib.sha256(clean).hexdigest()
        detail = f"{detail}; đã gỡ nội dung chủ động và dựng lại tệp (CDR)"[:500]
    return _finish(conn, attachment_id, "CLEAN", detail, digest, [*engines, cdr.ENGINE], report)


def disarm(content_type: str, data: bytes, digest: str, report: dict) -> bytes | None:
    """CDR sau khi quét sạch (ADR #70). Trả bản dựng lại, hoặc None khi giữ nguyên bản gốc; ghi kết quả vào báo cáo.

    Bản dựng lại được quét lại: bộ dựng lại hỏng hay sinh nội dung lạ thì không nhận tệp.
    """
    result = cdr.sanitize(content_type, data)
    report["cdr"] = result.as_dict() | {"original_sha256": digest, "original_size": len(data)}
    if not result.changed or result.data == data:
        return None
    again = scanner.scan_file(content_type, result.data)
    if again.verdict != "CLEAN":
        raise cdr.CdrError(f"Bản dựng lại không qua kiểm tra: {again.summary()}"[:300])
    report["cdr"]["size"] = len(result.data)
    return result.data


def rescan_unscanned(
    conn: psycopg.Connection,
    s3: storage.Storage,
    clamav_host: str = "",
    clamav_port: int = 3310,
    require_clamav: bool = False,
    limit: int = 10,
) -> int:
    """Quét lại các tệp cũ được nhận khi chưa có công cụ quét nào. Phát hiện vấn đề thì gỡ tệp và đổi trạng thái."""
    rows = conn.execute(
        """SELECT id, storage_key, content_type, sha256 FROM core.attachment
           WHERE status = 'CLEAN' AND scan_engines = '{unscanned}' AND deleted_at IS NULL
           ORDER BY created_at LIMIT %s FOR UPDATE SKIP LOCKED""",
        (limit,),
    ).fetchall()
    done = 0
    for attachment_id, key, content_type, digest in rows:
        data = s3.read_stored(key)
        if data is None:
            verdict, detail, engines, report = "REJECTED", "Không tìm thấy nội dung tệp trong kho để quét lại", [], {}
        elif hashlib.sha256(data).hexdigest() != digest:
            verdict, detail, engines, report = "REJECTED", "Nội dung tệp khác mã băm lúc nhận", [], {}
        else:
            try:
                verdict, detail, engines, report = scan_content(
                    content_type, data, clamav_host, clamav_port, require_clamav
                )
            except ActionError as exc:
                log.warning("chưa quét lại được %s: %s", attachment_id, exc.message)
                continue
        if verdict == "CLEAN":
            conn.execute(
                """UPDATE core.attachment SET status = 'CLEAN', scan_result = %s, scan_engines = %s,
                          scan_report = %s::jsonb, scanned_at = now() WHERE id = %s""",
                (detail, engines, json.dumps(report, ensure_ascii=False), attachment_id),
            )
        else:
            conn.execute("SELECT set_config('bms.rescan', 'on', true)")
            conn.execute(
                """UPDATE core.attachment SET status = %s, scan_result = %s, scan_engines = %s,
                          scan_report = %s::jsonb, scanned_at = now() WHERE id = %s""",
                (verdict, detail, engines, json.dumps(report, ensure_ascii=False) if report else None, attachment_id),
            )
            s3.delete(key)
            log.warning("quét lại: tệp %s bị chuyển %s: %s", attachment_id, verdict, detail)
        conn.commit()
        done += 1
    conn.commit()
    return done


def rescan_forever(settings, interval: float = 30.0) -> None:
    s3 = storage.Storage(settings)
    conn = psycopg.connect(settings.database_url)
    log.info("quét lại tệp cũ đang chạy")
    while True:
        try:
            rescan_unscanned(conn, s3, settings.clamav_host, settings.clamav_port, settings.scan_require_clamav)
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            log.warning("vòng quét lại lỗi: %s", exc)
        time.sleep(interval)


def start_rescan(settings) -> threading.Thread:
    thread = threading.Thread(target=rescan_forever, args=(settings,), name="attachment-rescan", daemon=True)
    thread.start()
    return thread


def get_download_url(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    s3 = _require_storage(ctx)
    att, person = _load(conn, session, args["attachment_id"])
    require_read(conn, att["entity_type"], att["entity_id"], person)
    if att["status"] != "CLEAN":
        raise ActionError(f"Tệp ở trạng thái {att['status']} không tải về được", "not-clean")
    if not att["scan_engines"] or att["scan_engines"] == ["unscanned"]:
        raise ActionError("Tệp đang chờ quét lại, thử lại sau ít phút", "not-scanned")
    return {
        "attachment_id": str(att["id"]),
        "expires_in": storage.DOWNLOAD_TTL,
        "url": s3.download_url(att["storage_key"], att["file_name"], att["content_type"]),
    }


EDITABLE_STATUSES = ("DRAFT", "PENDING", "RETURNED")


def delete_attachment(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    att, person = _load(conn, session, args["attachment_id"], lock=True)
    if att["uploaded_by"] != uuid.UUID(person):
        raise ActionError("Chỉ người tải lên được xóa tệp", "forbidden", 403)
    if att["entity_type"] in storage.STATUS_ENTITY_TYPES:
        row = conn.execute(f"SELECT status FROM {att['entity_type']} WHERE id = %s", (att["entity_id"],)).fetchone()
        if row and row[0] not in EDITABLE_STATUSES:
            raise ActionError(
                "Chứng từ đã kết thúc (đã duyệt, từ chối hoặc hủy): tệp đính kèm được giữ làm bằng chứng, không xóa được",
                "locked",
                409,
            )
    s3 = _require_storage(ctx)
    bind_session(conn, session)
    conn.execute("UPDATE core.attachment SET deleted_at = now() WHERE id = %s", (att["id"],))
    s3.delete(att["storage_key"])
    return {"attachment_id": str(att["id"]), "status": "DELETED", "scan_result": None}


def drive_usage(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    quota, user_quota = conn.execute(
        "SELECT storage_quota_bytes, user_storage_quota_bytes FROM core.tenant WHERE id = %s", (tenant,)
    ).fetchone()
    used = conn.execute("SELECT core.storage_used(%s)", (tenant,)).fetchone()[0]
    mine = conn.execute("SELECT core.storage_used_by(%s, %s)", (tenant, person)).fetchone()[0]
    rows = conn.execute(
        """SELECT content_type, sum(size_bytes)::bigint, count(*) FROM core.attachment
           WHERE tenant_id = %s AND deleted_at IS NULL AND status = 'CLEAN'
           GROUP BY content_type ORDER BY 2 DESC""",
        (tenant,),
    ).fetchall()
    return {
        "quota_bytes": quota,
        "used_bytes": used,
        "available_bytes": max(quota - used, 0),
        "user_quota_bytes": user_quota,
        "user_used_bytes": mine,
        "user_available_bytes": max(min(user_quota - mine, quota - used), 0),
        "by_type": [{"content_type": r[0], "bytes": r[1], "files": r[2]} for r in rows],
    }
