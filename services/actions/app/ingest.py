"""API nạp dữ liệu theo lô: POST /ingest/{loại} với NDJSON hoặc CSV, theo dõi bằng GET /ingest/jobs/{id}.

Dùng lại đúng các bộ xử lý và kiểm tra quyền của trang nhập dữ liệu quản trị (admin.SAVE), nhưng không bị giới hạn 5000 dòng
và 2 MB: dữ liệu đi từng lô nhỏ, mỗi lô một giao dịch; lỗi từng dòng được ghi lại; khóa `Idempotency-Key` chống nạp trùng.
"""

import csv
import hashlib
import io
import json
import logging
import uuid

import psycopg
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from starlette.concurrency import run_in_threadpool

from . import auth
from .admin import COLUMNS, SAVE, Admin, _db_message, _fold, _import_person, _order_units
from .common import ActionError

log = logging.getLogger("ingest")
router = APIRouter()

MAX_BYTES = 64 * 1024 * 1024
MAX_ROWS = 200_000
BATCH = 500
ATOMIC_MAX_ROWS = 20_000
MAX_ERRORS = 200


class Rollback(Exception):
    pass


def header_map(kind: str) -> dict[str, str]:
    mapping = {}
    for key, title, _required, _example in COLUMNS[kind]:
        mapping[_fold(key)] = key
        mapping[_fold(title)] = key
    return mapping


def normalize(kind: str, record: dict, mapping: dict[str, str]) -> dict:
    return {mapping[_fold(k)]: v for k, v in record.items() if _fold(k) in mapping}


def parse_rows(kind: str, content_type: str, body: bytes) -> list[tuple[int, dict | str]]:
    """Trả về [(số dòng, dòng dữ liệu | thông báo lỗi)]. Dòng sai định dạng thành lỗi của riêng nó."""
    mapping = header_map(kind)
    text = body.decode("utf-8-sig", errors="replace")
    rows: list[tuple[int, dict | str]] = []
    if "csv" in content_type or "text/plain" in content_type:
        reader = csv.reader(io.StringIO(text))
        header = next(reader, None)
        if not header:
            raise ActionError("Tệp CSV trống")
        keys = [mapping.get(_fold(h)) for h in header]
        missing = [title for key, title, required, _ in COLUMNS[kind] if required and key not in keys]
        if missing:
            raise ActionError(f"Thiếu cột: {', '.join(missing)}")
        for line, values in enumerate(reader, start=2):
            if all(str(v).strip() == "" for v in values):
                continue
            rows.append((line, {k: v for k, v in zip(keys, values, strict=False) if k}))
    else:
        for line, raw in enumerate(text.splitlines(), start=1):
            if not raw.strip():
                continue
            try:
                record = json.loads(raw)
            except ValueError:
                rows.append((line, "Dòng không phải JSON hợp lệ"))
                continue
            rows.append(
                (
                    line,
                    normalize(kind, record, mapping)
                    if isinstance(record, dict)
                    else "Mỗi dòng phải là một đối tượng JSON",
                )
            )
    if len(rows) > MAX_ROWS:
        raise ActionError(f"Tối đa {MAX_ROWS} dòng mỗi lần nạp", "too-large")
    return rows


def _job_summary(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "kind": row["kind"],
        "status": row["status"],
        "mode": row["mode"],
        "dry_run": row["dry_run"],
        "total": row["total"],
        "accepted": row["accepted"],
        "rejected": row["rejected"],
        "errors": row["errors"],
        "failure": row["failure"],
        "idempotent_replay": False,
    }


def run_job(
    pool,
    session: dict,
    kind: str,
    rows: list[tuple[int, dict | str]],
    mode: str,
    dry_run: bool,
    key: str,
    digest: str,
    size: int,
) -> dict:
    tenant, person = session["x-hasura-tenant-id"], session["x-hasura-user-id"]
    if kind not in COLUMNS or kind not in SAVE:
        raise ActionError(f"Không nạp được loại dữ liệu {kind}", "not-found", 404)
    if mode == "ATOMIC" and len(rows) > ATOMIC_MAX_ROWS:
        raise ActionError(
            f"Chế độ nguyên tử tối đa {ATOMIC_MAX_ROWS} dòng; dùng chế độ từng lô cho tệp lớn", "too-large"
        )
    with pool.connection() as conn:
        cur = conn.cursor(row_factory=dict_row)
        inserted = cur.execute(
            """INSERT INTO core.ingest_job (tenant_id, kind, idempotency_key, mode, dry_run, started_by, source_bytes, source_sha256, total)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (tenant_id, kind, idempotency_key) DO NOTHING RETURNING id""",
            (tenant, kind, key, mode, dry_run, person, size, digest, len(rows)),
        ).fetchone()
        conn.commit()
        if inserted is None:
            old = cur.execute(
                "SELECT * FROM core.ingest_job WHERE tenant_id = %s AND kind = %s AND idempotency_key = %s",
                (tenant, kind, key),
            ).fetchone()
            if old["status"] == "RUNNING":
                raise ActionError("Lần nạp với khóa này đang chạy", "conflict", 409)
            if old["source_sha256"] != digest:
                raise ActionError("Khóa Idempotency-Key này đã dùng cho một nội dung khác", "conflict", 409)
            return {**_job_summary(old), "idempotent_replay": True}
        job_id = inserted["id"]

    handler = _import_person if kind == "person" else SAVE[kind]
    ordered = rows
    if kind == "org_unit":
        good = [(n, r) for n, r in rows if isinstance(r, dict)]
        ordered = _order_units(good) + [(n, r) for n, r in rows if not isinstance(r, dict)]
    errors: list[dict] = []
    accepted = rejected = 0
    failure = None
    try:
        if mode == "ATOMIC" or dry_run:
            with pool.connection() as conn:
                a = Admin(conn, session)
                for line, row in ordered:
                    if isinstance(row, str):
                        rejected += 1
                        errors.append({"row": line, "message": row})
                        continue
                    try:
                        with conn.transaction():
                            handler(a, row)
                        accepted += 1
                    except ActionError as exc:
                        if exc.code == "forbidden":
                            raise
                        rejected += 1
                        errors.append({"row": line, "message": exc.message})
                    except psycopg.Error as exc:
                        rejected += 1
                        errors.append({"row": line, "message": _db_message(exc)})
                if dry_run or rejected:
                    conn.rollback()
                else:
                    conn.commit()
        else:
            for start in range(0, len(ordered), BATCH):
                with pool.connection() as conn:
                    a = Admin(conn, session)
                    for line, row in ordered[start : start + BATCH]:
                        if isinstance(row, str):
                            rejected += 1
                            errors.append({"row": line, "message": row})
                            continue
                        try:
                            with conn.transaction():
                                handler(a, row)
                            accepted += 1
                        except ActionError as exc:
                            if exc.code == "forbidden":
                                raise
                            rejected += 1
                            errors.append({"row": line, "message": exc.message})
                        except psycopg.Error as exc:
                            rejected += 1
                            errors.append({"row": line, "message": _db_message(exc)})
                    conn.commit()
                with pool.connection() as progress:
                    progress.execute(
                        "UPDATE core.ingest_job SET accepted = %s, rejected = %s WHERE id = %s",
                        (accepted, rejected, job_id),
                    )
    except ActionError as exc:
        failure = exc.message
        status = "FAILED"
        if exc.code != "forbidden":
            log.warning("nạp dữ liệu %s lỗi: %s", job_id, exc.message)
    except Exception as exc:  # noqa: BLE001
        failure = f"Lỗi không lường trước: {type(exc).__name__}"
        status = "FAILED"
        log.exception("nạp dữ liệu %s lỗi", job_id)
    else:
        if dry_run:
            status = "VALIDATED"
        elif mode == "ATOMIC" and rejected:
            status, failure, accepted = "FAILED", "Có dòng lỗi nên hoàn tác toàn bộ (chế độ nguyên tử)", 0
        else:
            status = "PARTIAL" if rejected else "DONE"
    errors.sort(key=lambda e: e["row"])
    with pool.connection() as conn:
        row = (
            conn.cursor(row_factory=dict_row)
            .execute(
                """UPDATE core.ingest_job SET status = %s, accepted = %s, rejected = %s, errors = %s::jsonb, failure = %s,
                      finished_at = now() WHERE id = %s RETURNING *""",
                (status, accepted, rejected, json.dumps(errors[:MAX_ERRORS], ensure_ascii=False), failure, job_id),
            )
            .fetchone()
        )
        conn.commit()
    if failure and status == "FAILED" and not accepted and not rejected and "quyền" in failure:
        raise ActionError(failure, "forbidden", 403)
    return _job_summary(row)


def _session(request: Request, tenant: str | None) -> dict:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise ActionError("Cần đăng nhập", "unauthorized", 401)
    try:
        claims = request.app.state.verifier.verify(header[7:].strip())
        with request.app.state.pool.connection() as conn:
            raw = auth.session_for(
                conn, claims, tenant, request.headers.get("x-hasura-role"), request.app.state.memberships
            )
    except auth.AuthError as exc:
        raise ActionError(str(exc), "unauthorized", 401) from exc
    session = {k.lower(): v for k, v in raw.items()}
    if "x-hasura-user-id" not in session:
        raise ActionError("Cần chọn tenant (header X-Bamboo-Tenant)", "bad-request", 400)
    return session


@router.post("/ingest/{kind}")
async def ingest(
    kind: str,
    request: Request,
    mode: str = "best-effort",
    dry_run: bool = False,
    idempotency_key: str | None = Header(default=None),
    x_bamboo_tenant: str | None = Header(default=None),
):
    try:
        session = _session(request, x_bamboo_tenant)
        if not idempotency_key or not 8 <= len(idempotency_key) <= 128:
            raise ActionError("Cần header Idempotency-Key (8–128 ký tự) để chống nạp trùng", "bad-request", 400)
        if mode not in ("best-effort", "atomic"):
            raise ActionError("mode chỉ nhận best-effort hoặc atomic", "bad-request", 400)
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BYTES:
                raise ActionError(f"Nội dung tối đa {MAX_BYTES // (1024 * 1024)} MB", "too-large", 413)
            chunks.append(chunk)
        body = b"".join(chunks)
        content_type = request.headers.get("content-type", "application/x-ndjson").lower()
        rows = parse_rows(kind, content_type, body) if kind in COLUMNS else []
        summary = await run_in_threadpool(
            run_job,
            request.app.state.pool,
            session,
            kind,
            rows,
            mode.replace("-", "_").upper(),
            dry_run,
            idempotency_key,
            hashlib.sha256(body).hexdigest(),
            size,
        )
    except ActionError as exc:
        return JSONResponse({"message": exc.message, "code": exc.code}, exc.status)
    return JSONResponse(summary, 200 if summary["status"] != "FAILED" else 422)


@router.get("/ingest/jobs/{job_id}")
async def job_status(job_id: str, request: Request, x_bamboo_tenant: str | None = Header(default=None)):
    try:
        session = _session(request, x_bamboo_tenant)
        uuid.UUID(job_id)
    except ValueError:
        return JSONResponse({"message": "Mã công việc không hợp lệ"}, 400)
    except ActionError as exc:
        return JSONResponse({"message": exc.message, "code": exc.code}, exc.status)

    def fetch():
        with request.app.state.pool.connection() as conn:
            return (
                conn.cursor(row_factory=dict_row)
                .execute(
                    "SELECT * FROM core.ingest_job WHERE id = %s AND tenant_id = %s AND started_by = %s",
                    (job_id, session["x-hasura-tenant-id"], session["x-hasura-user-id"]),
                )
                .fetchone()
            )

    row = await run_in_threadpool(fetch)
    if row is None:
        return JSONResponse({"message": "Không tìm thấy công việc"}, 404)
    return _job_summary(row)
