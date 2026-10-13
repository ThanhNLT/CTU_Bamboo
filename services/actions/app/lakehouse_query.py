# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Hasura Action cho trang Dịch vụ dữ liệu (ADR #45): tập dữ liệu tầng silver của Lakehouse qua Trino.

Người có quyền data.lakehouse.read (kiểm ở đơn vị gốc của tenant) xem danh sách tập dữ liệu và 20 dòng mới nhất
của một tập. actions đăng nhập Trino bằng tài khoản dịch vụ bms-actions nhưng truy vấn dưới danh nghĩa người dùng
tenant `t_<tenant_id>`: Trino chỉ cho người dùng này đọc view silver có cột tenant và tự thêm row filter về đúng
tenant (platform/trino/rules.json), nên dù câu SQL ở đây có sai sót cũng không đọc được dữ liệu tenant khác.
Giá trị trả về đã che dữ liệu cá nhân như nhật ký kiểm toán (ADR #43, BI-05).
"""

# ===== Thư viện chuẩn =====
import logging
import re
import uuid

# ===== Thư viện bên ngoài =====
import httpx  # HTTPX
import psycopg  # psycopg

# ===== Module nội bộ =====
from .audit import mask_row
from .common import ActionError, Context
from .trino import Trino, TrinoError

# ===== Hằng số & cấu hình =====
log = logging.getLogger(__name__)

PERMISSION = "data.lakehouse.read"
PREVIEW_ROWS = 20
DATASET_NAME = re.compile(r"^[a-z][a-z0-9_]{0,62}$")

# Tên hiển thị của các tập dữ liệu (view silver <schema>_<bảng>); tập chưa có tên thì hiện <schema>.<bảng>.
DOMAINS = {
    "core": "Tổ chức",
    "proc": "Mua sắm",
    "ic": "Giao dịch nội bộ",
    "wf": "Phê duyệt",
    "mdm": "Dữ liệu chủ",
    "mfg": "Sản xuất",
    "collab": "Cộng tác",
}
LABELS = {
    "collab_comment": "Trao đổi trên chứng từ",
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
    "wf_task": "Việc cần xử lý",
}


# ===== Hàm =====
def tenant_user(tenant: str) -> str:
    """Người dùng Trino của tenant (khớp mẫu t_<uuid> trong rules.json)."""
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
    """Các view silver người dùng tenant được đọc (information_schema đã lọc theo quyền của Trino)."""
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


# ===== Hasura Action =====
def lakehouse_datasets(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> list[dict]:
    tenant, client = _require(conn, session, ctx)
    return [_describe(name, cols) for name, cols in sorted(_datasets(client, tenant).items())]


def lakehouse_preview(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    """Số dòng và PREVIEW_ROWS dòng thay đổi gần nhất của một tập, đã che dữ liệu cá nhân."""
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


# ===== Đăng ký Action =====
HANDLERS = {
    "lakehouse_datasets": lakehouse_datasets,
    "lakehouse_preview": lakehouse_preview,
}
