# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Sinh văn bản từ mẫu: quyết định nhân sự và báo cáo KPI đã đóng băng.

Dùng chung đường ống với phiếu đề nghị mua sắm (`forms`): mẫu Jinja2 (tự escape) → Gotenberg/Chromium → PDF lưu trong kho
tài liệu theo mã băm nội dung, nên nội dung không đổi thì không dựng lại và mã kiểm tra trên chân trang là mã băm đó.
"""

import datetime as dt
import hashlib
import re

import psycopg
from psycopg.rows import dict_row

from . import forms, storage
from .common import ActionError, Context, bind_session, session_identity

TEMPLATE_VERSION = "1"
MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
TITLES = {
    "APPOINT": "Về việc bổ nhiệm cán bộ",
    "TRANSFER": "Về việc điều động, luân chuyển công tác",
    "DISMISS": "Về việc miễn nhiệm chức vụ",
}
ASSIGNMENT = {"PRIMARY": "chính thức", "CONCURRENT": "kiêm nhiệm", "ACTING": "quyền (tạm thời)"}


def _need_pdf(ctx: Context) -> None:
    if ctx.storage is None or not ctx.gotenberg_url:
        raise ActionError("Chưa cấu hình in văn bản", "unavailable", 503)


def _publish(ctx: Context, prefix: str, digest: str, html: str, doc_no: str, file_name: str) -> dict:
    """Dựng PDF nếu chưa có bản cùng mã băm rồi trả liên kết tải có chữ ký."""
    key = f"{prefix}/{digest}.pdf"
    cached = ctx.storage.document_exists(key)
    if not cached:
        try:
            pdf = forms.html_to_pdf(ctx.gotenberg_url, html, forms.footer(doc_no, digest[:16].upper()))
        except forms.PdfUnavailable as exc:
            raise ActionError("Tạm thời chưa in được văn bản, thử lại sau", "pdf-unavailable", 503) from exc
        ctx.storage.put_document(key, pdf, "application/pdf")
    return {
        "file_name": file_name,
        "check_code": digest[:16].upper(),
        "cached": cached,
        "expires_in": storage.DOWNLOAD_TTL,
        "url": ctx.storage.download_url(key, file_name, "application/pdf"),
    }


def _digest(*parts: str) -> str:
    h = hashlib.sha256(f"{TEMPLATE_VERSION}\n".encode())
    for part in parts:
        h.update(part.encode())
    return h.hexdigest()


# --- Quyết định nhân sự -----------------------------------------------------------------------------------------------


def _decision(conn: psycopg.Connection, session: dict, decision_id: str) -> dict:
    tenant = session.get("x-hasura-tenant-id")
    person = session_identity(session, tenant)
    bind_session(conn, session)
    can_all = conn.execute("SELECT hr.can_read_decisions(%s, %s)", (person, tenant)).fetchone()[0]
    d = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT d.id, d.tenant_id, d.doc_no, d.decision_type, d.assignment_type, d.reason, d.effective_date,
                      d.created_at, p.full_name AS person, p.employee_code, i.full_name AS issuer,
                      ip.name AS issuer_position, src.name AS source_position, su.name AS source_unit,
                      dst.name AS target_position, du.name AS target_unit,
                      (SELECT le.name FROM core.org_unit le
                       WHERE le.tenant_id = d.tenant_id AND le.is_legal_entity AND le.path @> iu.path
                       ORDER BY nlevel(le.path) DESC LIMIT 1) AS company
               FROM hr.personnel_decision d
               JOIN core.person p ON p.id = d.person_id
               JOIN core.person i ON i.id = d.issuer_id
               JOIN core.position ip ON ip.id = d.issuer_position_id
               JOIN core.org_unit iu ON iu.id = ip.org_unit_id
               LEFT JOIN core.position src ON src.id = d.source_position_id
               LEFT JOIN core.org_unit su ON su.id = src.org_unit_id
               LEFT JOIN core.position dst ON dst.id = d.target_position_id
               LEFT JOIN core.org_unit du ON du.id = dst.org_unit_id
               WHERE d.id = %s AND d.tenant_id = %s AND (%s OR d.issuer_id = %s OR d.person_id = %s)""",
            (decision_id, tenant, can_all, person, person),
        )
        .fetchone()
    )
    if d is None:
        raise ActionError("Không tìm thấy quyết định", "not-found", 404)
    return d


def decision_article(d: dict) -> str:
    who = f"{d['person']}" + (f" (mã nhân sự {d['employee_code']})" if d["employee_code"] else "")
    target = f"{d['target_position']} – {d['target_unit']}" if d["target_position"] else ""
    source = f"{d['source_position']} – {d['source_unit']}" if d["source_position"] else ""
    if d["decision_type"] == "APPOINT":
        return f"Bổ nhiệm {who} giữ chức danh {target} ({ASSIGNMENT[d['assignment_type']]})."
    if d["decision_type"] == "TRANSFER":
        return f"Điều động {who} từ chức danh {source} sang chức danh {target}."
    return f"Miễn nhiệm {who} khỏi chức danh {source}."


def render_decision(d: dict) -> str:
    at = d["created_at"].astimezone(dt.timezone(dt.timedelta(hours=7)))
    view = {
        **d,
        "title": TITLES[d["decision_type"]],
        "article1": decision_article(d),
        "effective": d["effective_date"].strftime("%d/%m/%Y"),
        "place": "Hà Nội",
        "day": f"{at.day:02d}",
        "month": f"{at.month:02d}",
        "year": at.year,
        "company": d["company"] or "Đơn vị",
        "check_code": "{check_code}",
    }
    return forms._env.get_template("quyet_dinh_nhan_su.html").render(d=view)


def get_personnel_decision_pdf(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    _need_pdf(ctx)
    d = _decision(conn, session, args["decision_id"])
    html = render_decision(d)
    digest = _digest(html)
    html = html.replace("{check_code}", digest[:16].upper())
    out = _publish(
        ctx, f"{d['tenant_id']}/hr.personnel_decision/{d['id']}/forms", digest, html, d["doc_no"], f"{d['doc_no']}.pdf"
    )
    return {"decision_id": str(d["id"]), "doc_no": d["doc_no"], **out}


# --- Báo cáo KPI đã đóng băng -----------------------------------------------------------------------------------------


def period_label(grain: str, start: dt.datetime) -> str:
    local = start.astimezone(dt.timezone(dt.timedelta(hours=7)))
    if grain == "hour":
        return local.strftime("%d/%m/%Y %H:00")
    if grain == "day":
        return local.strftime("%d/%m/%Y")
    if grain == "week":
        return "Tuần từ " + local.strftime("%d/%m/%Y")
    return f"Tháng {local.month:02d}/{local.year}"


def assess(value: float, direction: str, threshold: float | None) -> str:
    if threshold is None or direction == "neutral":
        return "–"
    ok = value >= threshold if direction == "up" else value <= threshold
    return "Đạt ngưỡng" if ok else "Chưa đạt ngưỡng"


def kpi_snapshots(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> list[dict]:
    """Số liệu đã đóng băng của một chỉ số, mới nhất trước; `valid` = mã băm còn khớp giá trị."""
    tenant = session.get("x-hasura-tenant-id")
    session_identity(session, tenant)
    limit = min(max(int(args.get("limit") or 60), 1), 500)
    broken = {
        (r[0], r[1]) for r in conn.execute("SELECT kpi_key, period_start FROM kpi.verify_snapshots(%s)", (tenant,))
    }
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(
            """SELECT s.kpi_key, d.label, d.unit, s.grain, s.period_start, s.value, s.sha256,
                  to_char(s.frozen_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS frozen_at
           FROM kpi.snapshot s JOIN kpi.definition d ON d.tenant_id = s.tenant_id AND d.key = s.kpi_key
           WHERE s.tenant_id = %s AND s.kpi_key = %s ORDER BY s.period_start DESC LIMIT %s""",
            (tenant, args["kpi_key"], limit),
        )
        .fetchall()
    )
    return [
        {
            "kpi_key": r["kpi_key"],
            "label": r["label"],
            "unit": r["unit"],
            "grain": r["grain"],
            "period": period_label(r["grain"], r["period_start"]),
            "value": r["value"],
            "sha256": r["sha256"],
            "frozen_at": r["frozen_at"],
            "valid": (r["kpi_key"], r["period_start"]) not in broken,
        }
        for r in rows
    ]


def _kpi_report(conn: psycopg.Connection, tenant: str, month: str | None) -> dict:
    cur = conn.cursor(row_factory=dict_row)
    clauses, params = "", [tenant]
    label = "Toàn bộ các kỳ đã đóng băng (tối đa 12 kỳ gần nhất mỗi chỉ số)"
    if month:
        if not MONTH.match(month):
            raise ActionError("Tháng báo cáo có dạng YYYY-MM")
        clauses = """AND s.period_start >= (%s || '-01')::date AT TIME ZONE 'Asia/Ho_Chi_Minh'
                     AND s.period_start < ((%s || '-01')::date + interval '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh'"""
        params += [month, month]
        label = f"Tháng {month[5:]}/{month[:4]}"
    broken = {
        (r[0], r[1]) for r in conn.execute("SELECT kpi_key, period_start FROM kpi.verify_snapshots(%s)", (tenant,))
    }
    rows = cur.execute(
        f"""SELECT d.key, d.label, d.unit, d.definition, d.good_direction, d.threshold, s.grain, s.period_start,
                   s.value, s.sha256
            FROM kpi.snapshot s JOIN kpi.definition d ON d.tenant_id = s.tenant_id AND d.key = s.kpi_key
            WHERE s.tenant_id = %s {clauses} ORDER BY d.label, s.period_start DESC""",
        params,
    ).fetchall()
    grouped: dict[str, dict] = {}
    for r in rows:
        k = grouped.setdefault(
            r["key"], {"label": r["label"], "unit": r["unit"], "definition": r["definition"], "rows": []}
        )
        if len(k["rows"]) < (500 if month else 12):
            k["rows"].append(
                {
                    "period": period_label(r["grain"], r["period_start"]),
                    "value": r["value"],
                    "sha256": r["sha256"],
                    "assessment": assess(r["value"], r["good_direction"], r["threshold"]),
                    "valid": (r["key"], r["period_start"]) not in broken,
                }
            )
    name = conn.execute("SELECT name FROM core.tenant WHERE id = %s", (tenant,)).fetchone()[0]
    return {"tenant_name": name, "period_label": label, "kpis": list(grouped.values())}


def get_kpi_report_pdf(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    _need_pdf(ctx)
    tenant = session.get("x-hasura-tenant-id")
    session_identity(session, tenant)
    month = args.get("month")
    report = _kpi_report(conn, tenant, month)
    html = forms._env.get_template("bao_cao_kpi.html").render(r=report)
    digest = _digest(html)
    suffix = month or "tong-hop"
    out = _publish(ctx, f"{tenant}/kpi.snapshot/forms", digest, html, f"KPI-{suffix}", f"bao-cao-kpi-{suffix}.pdf")
    return {"month": month, "kpis": len(report["kpis"]), **out}


HANDLERS = {
    "get_personnel_decision_pdf": get_personnel_decision_pdf,
    "kpi_snapshots": kpi_snapshots,
    "get_kpi_report_pdf": get_kpi_report_pdf,
}
