# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

"""Quy trình ⇄ văn bản quy định trong thư viện tri thức (ADR #59).

- `process_from_document`: đọc văn bản đang hiệu lực trong thư viện (tệp đính kèm, OCR, tóm tắt, mục lục) theo mẫu quy
  trình (`process_text`), dựng bản nháp sơ đồ BPMN có bố cục tự động rồi lưu thành quy trình của người gọi.
- `process_regulation_draft`: từ một phiên bản sơ đồ đã phát hành lập văn bản quy định (văn bản mẫu `.txt` đọc lại được
  và bản PDF có hình sơ đồ), tạo đề xuất tài liệu trong thư viện tri thức và có thể gửi duyệt luôn. Duyệt xong, văn bản
  là quy định đang hiệu lực của công ty, thay thế quy định của phiên bản trước.
"""

import hashlib
import json
import logging
import re
import uuid

import psycopg
from psycopg.rows import dict_row

from . import attachments, forms, ocr, search, storage
from . import process_design as pd
from . import process_text as pt
from .common import ActionError, Context, bind_session

log = logging.getLogger("process_regulation")
ENTITY = "collab.kb_document"
TEXT_ORDER = (
    "text/markdown",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
)
SCOPE_TEXT = {
    "UNIT": "Đơn vị {unit} và các đơn vị trực thuộc",
    "COMPANY": "Toàn bộ công ty chứa đơn vị {unit}",
    "GROUP": "Toàn tập đoàn: công ty mẹ và các công ty thành viên",
}


def _doc_texts(conn: psycopg.Connection, ctx: Context, doc: dict) -> list[tuple[str, str]]:
    """Các nguồn chữ của tài liệu, tệp dễ đọc nhất trước: (tên nguồn, nội dung)."""
    files = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT id, file_name, content_type, storage_key FROM core.attachment
               WHERE entity_type = %s AND entity_id = %s AND status = 'CLEAN' AND deleted_at IS NULL
                 AND scan_engines <> '{unscanned}' ORDER BY created_at""",
            (ENTITY, doc["id"]),
        )
        .fetchall()
    )
    files.sort(key=lambda f: TEXT_ORDER.index(f["content_type"]) if f["content_type"] in TEXT_ORDER else 99)
    out: list[tuple[str, str]] = []
    for f in files:
        text = ""
        if f["content_type"] in search.TEXT_TYPES and ctx.storage is not None:
            data = ctx.storage.read_stored(f["storage_key"], storage.MAX_BYTES)
            if data:
                try:
                    text = search.extract_lines(ctx.tika_url, data, f["content_type"])
                except search.SearchUnavailable as exc:
                    raise ActionError(
                        "Chưa đọc được nội dung tệp (Tika tạm thời không dùng được)", "unavailable", 503
                    ) from exc
        text = text or ocr.text_of(conn, f["id"])
        if text.strip():
            out.append((f["file_name"], text))
    meta = "\n".join(x for x in [doc["summary"] or "", *(doc["toc"] or [])] if x)
    if meta.strip():
        out.append(("tóm tắt và mục lục", meta))
    return out


def _unique_key(conn: psycopg.Connection, tenant: str, base: str) -> str:
    base = re.sub(r"[^A-Za-z0-9_-]+", "_", base).strip("_-")[:50] or "quy_trinh"
    if not re.match(r"^[A-Za-z_]", base):
        base = "qt_" + base
    key, n = base, 1
    while conn.execute(
        "SELECT 1 FROM wf.process_model WHERE tenant_id = %s AND process_key = %s", (tenant, key)
    ).fetchone():
        n += 1
        key = f"{base}_{n}"
    return key


def process_from_document(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    person, tenant = pd._who(conn, session)
    doc = (
        conn.cursor(row_factory=dict_row)
        .execute(
            "SELECT id, title, status, summary, toc, org_unit_id, doc_no FROM collab.kb_document WHERE id = %s AND tenant_id = %s",
            (args["document_id"], tenant),
        )
        .fetchone()
    )
    if (
        doc is None
        or not conn.execute("SELECT wf.entity_can_read(%s, %s, %s)", (ENTITY, doc["id"], person)).fetchone()[0]
    ):
        raise ActionError("Không tìm thấy tài liệu", "not-found", 404)
    if doc["status"] != "APPROVED":
        raise ActionError("Chỉ dựng sơ đồ từ tài liệu đang hiệu lực trong thư viện tri thức", "rejected")
    unit = args.get("owner_unit_id") or doc["org_unit_id"]
    if not conn.execute(
        "SELECT 1 FROM core.org_unit WHERE id = %s AND tenant_id = %s AND valid_period @> now()", (unit, tenant)
    ).fetchone():
        raise ActionError("Không tìm thấy đơn vị sở hữu quy trình", "not-found", 404)
    if not pd._can_design(conn, person, tenant, str(unit)):
        raise ActionError(f"Cần quyền {pd.PERMISSION} tại đơn vị này để tạo quy trình", "forbidden", 403)

    sources = _doc_texts(conn, ctx, doc)
    spec, source, tried = None, "", []
    for name, text in sources:
        found = pt.parse(text, doc["title"])
        tried.append(name)
        if found.steps:
            spec, source = found, name
            break
    if spec is None:
        raise ActionError(
            "Không tìm thấy các bước trong tài liệu. Ghi mỗi bước một dòng “Bước 1. Tên bước” kèm “Người thực hiện:”, "
            "“Nếu …: chuyển Bước N” (xem mẫu ở nút Lập quy định từ một quy trình). "
            + (f"Đã đọc: {', '.join(tried)}." if tried else "Tài liệu chưa có nội dung đọc được."),
            "no-steps",
        )
    name = (spec.name or doc["title"])[:200]
    key = _unique_key(conn, tenant, spec.key or pt.slug(name, "_", False, 50))
    xml, layout = pt.build_bpmn(spec, key, name)
    xml = pd.with_process_id(xml, key, name)
    forms_list: list[dict] = []
    description = spec.purpose or f"Dựng từ tài liệu {doc['doc_no']}: {doc['title']}"
    model_id = conn.execute(
        """INSERT INTO wf.process_model (tenant_id, process_key, name, description, bpmn_xml, forms, created_by, updated_by,
                                         owner_unit_id)
           VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s) RETURNING id""",
        (tenant, key, name, description[:2000], xml, json.dumps(forms_list), person, person, unit),
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO wf.process_regulation (tenant_id, model_id, kb_document_id, kind, created_by) VALUES (%s, %s, %s, 'SOURCE', %s)",
        (tenant, model_id, doc["id"], person),
    )
    warnings = list(spec.warnings)
    if layout.unrouted:
        warnings.append(f"{len(layout.unrouted)} đường nối chưa xếp được gọn, nên kéo lại trong trình vẽ")
    return {
        "id": str(model_id),
        "name": name,
        "process_key": key,
        "steps": len(spec.steps),
        "source": source,
        "issues": pd.lint(xml, forms_list),
        "warnings": warnings,
    }


def _attach(
    conn: psycopg.Connection, ctx: Context, tenant: str, doc_id: str, person: str, name: str, ctype: str, data: bytes
) -> str:
    quota = conn.execute("SELECT storage_quota_bytes FROM core.tenant WHERE id = %s FOR UPDATE", (tenant,)).fetchone()[
        0
    ]
    used = conn.execute("SELECT core.storage_used(%s)", (tenant,)).fetchone()[0]
    if used + len(data) > quota:
        raise ActionError("Vượt hạn mức dung lượng của đơn vị", "file-quota")
    att_id = str(uuid.uuid4())
    key = f"{tenant}/{ENTITY}/{doc_id}/{att_id}"
    verdict, detail, engines, report = attachments.scan_content(
        ctype, data, ctx.clamav_host, ctx.clamav_port, ctx.require_clamav
    )
    if verdict != "CLEAN":
        raise ActionError(f"Tệp {name} không qua kiểm dịch: {detail}", "rejected")
    conn.execute(
        """INSERT INTO core.attachment (tenant_id, id, entity_type, entity_id, file_name, content_type, size_bytes,
                                        storage_key, uploaded_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (tenant, att_id, ENTITY, doc_id, name, ctype, len(data), key, person),
    )
    ctx.storage.put_document(key, data, ctype)
    attachments._finish(conn, att_id, "CLEAN", detail, hashlib.sha256(data).hexdigest(), engines, report)
    return att_id


def _position(conn: psycopg.Connection, person: str, wanted: str | None) -> tuple[str, str]:
    rows = conn.execute(
        """SELECT a.position_id, pos.org_unit_id FROM core.assignment a JOIN core.position pos ON pos.id = a.position_id
           WHERE a.person_id = %s AND a.valid_period @> now() AND core.has_permission(%s, 'kb.document.create', pos.org_unit_id)
           ORDER BY (a.assignment_type = 'PRIMARY') DESC, a.created_at""",
        (person, person),
    ).fetchall()
    for position, unit in rows:
        if wanted is None or str(position) == str(wanted):
            return str(position), str(unit)
    raise ActionError(
        "Bạn chưa có quyền kb.document.create ở vị trí nào để đề xuất tài liệu vào thư viện tri thức"
        if wanted is None
        else "Vị trí lập tài liệu không hợp lệ hoặc thiếu quyền kb.document.create",
        "forbidden",
        403,
    )


def _steps_view(spec: pt.ProcessSpec) -> list[dict]:
    steps = {s.no: s for s in spec.steps}

    def goal(no: int | None, end: str, following: int | None) -> str:
        if no == -1:
            no = following
        return f"kết thúc ({end or pt.DEFAULT_END})" if no is None else f"Bước {no}: {steps[no].name}"

    out = []
    for i, s in enumerate(spec.steps):
        following = spec.steps[i + 1].no if i + 1 < len(spec.steps) else None
        if s.branches:
            moves = [f"Nếu {b.label}: {goal(b.target, b.end_name, following)}" for b in s.branches]
        else:
            moves = [goal(s.next, s.end_name, following)]
        out.append(
            {
                "no": s.no,
                "name": s.name,
                "note": s.note,
                "role": s.role,
                "due": pt.due_text(s.due),
                "transitions": moves,
            }
        )
    return out


def process_regulation_draft(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    if ctx.storage is None:
        raise ActionError("Chưa cấu hình lưu trữ tệp", "unavailable", 503)
    person, tenant, m = pd._need_design(conn, session, args["id"])
    cur = conn.cursor(row_factory=dict_row)
    version_no = args.get("version")
    row = cur.execute(
        """SELECT version, bpmn_xml, audience, sha256 FROM wf.process_version WHERE model_id = %s
           AND (%s::int IS NULL OR version = %s::int) ORDER BY version DESC LIMIT 1""",
        (m["id"], version_no, version_no),
    ).fetchone()
    if row is None:
        raise ActionError("Phát hành quy trình trước: văn bản quy định lập từ phiên bản đã phát hành", "rejected")
    live = cur.execute(
        """SELECT d.doc_no, d.status FROM wf.process_regulation r JOIN collab.kb_document d ON d.id = r.kb_document_id
           WHERE r.model_id = %s AND r.kind = 'REGULATION' AND r.version = %s
             AND d.status NOT IN ('CANCELLED', 'REJECTED', 'RETIRED')""",
        (m["id"], row["version"]),
    ).fetchone()
    if live:
        raise ActionError(
            f"Phiên bản v{row['version']} đã có văn bản quy định {live['doc_no']} ({live['status']})", "rejected"
        )

    unit_name = conn.execute(
        "SELECT name FROM core.org_unit WHERE id = coalesce(%s, wf.root_unit(%s))", (m["owner_unit_id"], tenant)
    ).fetchone()[0]
    audience = row["audience"]
    spec = pt.spec_from_bpmn(row["bpmn_xml"], m["name"], m["process_key"], m["description"] or "")
    spec.scope = SCOPE_TEXT.get(audience, SCOPE_TEXT["UNIT"]).format(unit=unit_name)
    if not spec.steps:
        raise ActionError("Sơ đồ chưa có bước nào để lập văn bản", "rejected")
    text = pt.render_text(spec)

    position, org_unit = _position(conn, person, args.get("requester_position_id"))
    supersedes = conn.execute(
        """SELECT d.id FROM wf.process_regulation r JOIN collab.kb_document d ON d.id = r.kb_document_id
           WHERE r.model_id = %s AND r.kind = 'REGULATION' AND d.status = 'APPROVED' ORDER BY r.version DESC LIMIT 1""",
        (m["id"],),
    ).fetchone()
    summary = spec.purpose or f"Quy định thực hiện quy trình {m['name']}"
    summary = f"{summary}. Quy trình gồm {len(spec.steps)} bước (phiên bản v{row['version']})."[:3900]
    bind_session(conn, session)
    doc_id, doc_no = conn.execute(
        """INSERT INTO collab.kb_document (tenant_id, title, category, scope, summary, toc, effective_date, supersedes_id,
                                           requester_id, requester_position_id, org_unit_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id, doc_no""",
        (
            tenant,
            f"Quy trình {m['name']}"[:300],
            "sop",
            "group" if audience == "GROUP" else "company",
            summary,
            [f"Bước {s.no}. {s.name}" for s in spec.steps][:60],
            args.get("effective_date"),
            supersedes[0] if supersedes else None,
            person,
            position,
            org_unit,
        ),
    ).fetchone()
    doc_id = str(doc_id)
    conn.execute(
        """INSERT INTO wf.process_regulation (tenant_id, model_id, version, kb_document_id, kind, created_by)
           VALUES (%s, %s, %s, %s, 'REGULATION', %s)""",
        (tenant, m["id"], row["version"], doc_id, person),
    )

    base = f"{m['process_key']}-v{row['version']}"
    files = [f"{base}.txt"]
    _attach(conn, ctx, tenant, doc_id, person, files[0], "text/plain", text.encode("utf-8"))
    pdf_note = ""
    if ctx.gotenberg_url:
        digest = hashlib.sha256(text.encode()).hexdigest()
        html = forms._env.get_template("quy_dinh_quy_trinh.html").render(
            d={
                "title": f"Quy trình {m['name']}",
                "name": m["name"],
                "company": conn.execute(
                    "SELECT name FROM core.org_unit WHERE id = coalesce(core.company_of(%s), %s)", (org_unit, org_unit)
                ).fetchone()[0],
                "unit": unit_name,
                "doc_no": doc_no,
                "version": row["version"],
                "purpose": spec.purpose,
                "scope": spec.scope,
                "svg": pt.render_svg(spec),
                "steps": _steps_view(spec),
                "sha": row["sha256"][:16].upper(),
            }
        )
        try:
            pdf = forms.html_to_pdf(ctx.gotenberg_url, html, forms.footer(doc_no, digest[:16].upper()))
            _attach(conn, ctx, tenant, doc_id, person, f"{base}.pdf", "application/pdf", pdf)
            files.append(f"{base}.pdf")
        except (forms.PdfUnavailable, ActionError) as exc:
            log.warning("không đính kèm được PDF quy định %s: %s", doc_no, exc)
            pdf_note = "Chưa dựng được bản PDF (chỉ có tệp văn bản mẫu)."

    submitted, message = False, pdf_note
    if args.get("submit"):
        try:
            with conn.transaction():
                conn.execute("SELECT collab.submit_kb_document(%s, %s)", (doc_id, person))
            submitted = True
        except psycopg.errors.RaiseException as exc:
            message = (exc.diag.message_primary or str(exc)) + (" " + pdf_note if pdf_note else "")
    status = conn.execute("SELECT status FROM collab.kb_document WHERE id = %s", (doc_id,)).fetchone()[0]
    return {
        "document_id": doc_id,
        "doc_no": doc_no,
        "status": status,
        "version": row["version"],
        "files": files,
        "submitted": submitted,
        "message": message or None,
    }


def regulations(conn: psycopg.Connection, model_id: str) -> list[dict]:
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT r.kind, r.version, d.id, d.doc_no, d.title, d.status,
                      to_char(d.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD-Mon-YYYY HH24:MI') AS published_at
               FROM wf.process_regulation r JOIN collab.kb_document d ON d.id = r.kb_document_id
               WHERE r.model_id = %s ORDER BY r.created_at DESC LIMIT 50""",
            (model_id,),
        )
        .fetchall()
    )
    return [{**r, "id": str(r["id"])} for r in rows]


HANDLERS = {
    "process_from_document": process_from_document,
    "process_regulation_draft": process_regulation_draft,
}
