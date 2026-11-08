import logging
import re
import uuid

import httpx
import psycopg

from .audit import mask_row
from .common import ActionError, Context
from .trino import Trino, TrinoError

log = logging.getLogger(__name__)

PERMISSION = "data.lakehouse.read"
PREVIEW_ROWS = 20
DATASET_NAME = re.compile(r"^[a-z][a-z0-9_]{0,62}$")

DOMAINS = {
    "core": "Tổ chức",
    "proc": "Mua sắm",
    "ic": "Giao dịch nội bộ",
    "wf": "Phê duyệt",
    "mdm": "Dữ liệu chủ",
    "mfg": "Sản xuất",
    "collab": "Cộng tác",
    "kpi": "Chỉ số KPI",
}
LABELS = {
    "collab_comment": "Trao đổi trên chứng từ",
    "collab_kb_document": "Tài liệu thư viện tri thức",
    "collab_notification": "Thông báo",
    "core_assignment": "Bổ nhiệm",
    "core_attachment": "Tệp đính kèm",
    "core_catalog_item": "Danh mục dùng chung",
    "core_delegation": "Ủy quyền",
    "core_doc_sequence": "Dãy số chứng từ",
    "core_org_unit": "Đơn vị tổ chức",
    "core_person": "Nhân sự",
    "core_position": "Vị trí công việc",
    "core_role": "Vai trò",
    "core_role_grant": "Cấp vai trò",
    "core_role_permission": "Quyền của vai trò",
    "core_team": "Nhóm làm việc",
    "core_team_member": "Thành viên nhóm",
    "core_tenant": "Tenant",
    "ic_ic_order": "Đơn hàng nội bộ",
    "ic_ic_order_item": "Dòng đơn hàng nội bộ",
    "kpi_snapshot": "KPI đã đóng băng",
    "mdm_item": "Vật tư, hàng hóa",
    "mdm_partner": "Nhà cung cấp",
    "mfg_lot": "Lô sản xuất",
    "proc_purchase_order": "Đơn mua",
    "proc_purchase_order_item": "Dòng đơn mua",
    "proc_purchase_request": "Đề nghị mua sắm",
    "proc_purchase_request_item": "Dòng đề nghị mua sắm",
    "wf_approval_history": "Lịch sử phê duyệt",
    "wf_approval_rule": "Quy tắc phê duyệt",
    "wf_approval_step": "Bước phê duyệt",
    "wf_flow_sync": "Đồng bộ Flowable",
    "wf_process_model": "Quy trình thiết kế",
    "wf_process_version": "Phiên bản quy trình",
    "wf_sandbox_run": "Lần chạy thử quy trình",
    "wf_task": "Việc cần xử lý",
}


def tenant_user(tenant: str) -> str:
    return f"t_{uuid.UUID(str(tenant))}"


def _require(conn: psycopg.Connection, session: dict, ctx: Context) -> tuple[str, Trino]:
    person, tenant = session.get("x-hasura-user-id"), session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    allowed = conn.execute(
        """SELECT core.has_permission(%s, %s, u.id) FROM core.org_unit u
           WHERE u.tenant_id = %s AND u.parent_id IS NULL AND u.valid_period @> now()
           ORDER BY u.created_at LIMIT 1""",
        (person, PERMISSION, tenant),
    ).fetchone()
    if not (allowed and allowed[0]):
        raise ActionError(f"Cần quyền {PERMISSION} để xem dữ liệu Lakehouse", "forbidden", 403)
    if ctx.lakehouse is None:
        raise ActionError("Lakehouse chưa được cấu hình (thiếu tài khoản Trino)", "lakehouse-unavailable", 503)
    return tenant, ctx.lakehouse


def _query(client: Trino, tenant: str, sql: str) -> tuple[list[dict], list[list]]:
    try:
        return client.query(sql, as_user=tenant_user(tenant), schema="silver")
    except TrinoError as exc:
        if exc.name in ("PERMISSION_DENIED", "TABLE_NOT_FOUND"):
            raise ActionError("Không có tập dữ liệu này", "not-found", 404) from exc
        log.warning("lakehouse: Trino báo lỗi: %s", exc)
        raise ActionError("Lakehouse báo lỗi khi truy vấn", "lakehouse-error", 502) from exc
    except httpx.HTTPError as exc:
        log.warning("lakehouse: không gọi được Trino: %s", exc)
        raise ActionError("Lakehouse tạm thời không truy cập được", "lakehouse-unavailable", 503) from exc


def _describe(name: str, columns: list[dict]) -> dict:
    schema = name.split("_", 1)[0]
    return {
        "name": name,
        "label": LABELS.get(name, name.replace("_", ".", 1)),
        "domain": DOMAINS.get(schema, schema),
        "columns": columns,
    }


def _datasets(client: Trino, tenant: str) -> dict[str, list[dict]]:
    _, rows = _query(
        client,
        tenant,
        "SELECT table_name, column_name, data_type FROM information_schema.columns "
        "WHERE table_schema = 'silver' ORDER BY table_name, ordinal_position",
    )
    out: dict[str, list[dict]] = {}
    for table, column, data_type in rows:
        out.setdefault(table, []).append({"name": column, "type": data_type})
    return out


def lakehouse_datasets(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> list[dict]:
    tenant, client = _require(conn, session, ctx)
    return [_describe(name, cols) for name, cols in sorted(_datasets(client, tenant).items())]


def lakehouse_preview(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    tenant, client = _require(conn, session, ctx)
    name = str(args.get("dataset") or "")
    if not DATASET_NAME.match(name):
        raise ActionError("Tên tập dữ liệu không hợp lệ", "bad-request")
    datasets = _datasets(client, tenant)
    if name not in datasets:
        raise ActionError("Không có tập dữ liệu này", "not-found", 404)
    _, total = _query(client, tenant, f'SELECT count(*) FROM "{name}"')
    columns, rows = _query(client, tenant, f'SELECT * FROM "{name}" ORDER BY _changed_at DESC LIMIT {PREVIEW_ROWS}')
    found: set[str] = set()
    masked_rows = []
    for row in rows:
        masked, labels = mask_row(dict(zip((c["name"] for c in columns), row, strict=True)))
        found |= labels
        masked_rows.append(masked)
    return {**_describe(name, columns), "total_rows": total[0][0], "rows": masked_rows, "masked": sorted(found)}


HANDLERS = {
    "lakehouse_datasets": lakehouse_datasets,
    "lakehouse_preview": lakehouse_preview,
}
