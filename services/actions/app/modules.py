# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Mô-đun chức năng (ADR #56).

Danh mục mô-đun dựng sẵn nằm ở đây; CSDL chỉ giữ trạng thái hai tầng (migration 042):
- **cài trên máy** (`core.module_install`, quản trị nền tảng): container của mô-đun được chạy;
- **bật cho công ty** (`core.tenant_module`, quản trị công ty có `core.module.manage`): Action, bảng và menu dùng được.

Phần lõi (tổ chức, người, phân quyền, danh mục, kiểm toán, thông báo, vận hành) luôn bật. Mô-đun tắt thì Action của nó
trả `module-disabled`, dữ liệu giữ nguyên, bật lại dùng tiếp. Bật một mô-đun thì bật luôn mô-đun nó phụ thuộc; không tắt
được mô-đun khi còn mô-đun khác đang bật dựa vào nó hoặc còn chứng từ đang dở.
"""

import logging
from dataclasses import dataclass

import httpx
import psycopg

from .common import ActionError, Context

log = logging.getLogger("modules")

MANAGE = "core.module.manage"


@dataclass(frozen=True)
class OpenWork:
    """Một loại việc đang dở chặn việc tắt mô-đun: câu SQL đếm theo tenant (tham số %(tenant)s)."""

    label: str
    sql: str


@dataclass(frozen=True)
class Module:
    code: str
    name: str
    description: str
    depends: tuple[str, ...] = ()
    services: tuple[str, ...] = ()
    actions: frozenset[str] = frozenset()
    open_work: tuple[OpenWork, ...] = ()
    external: bool = False
    vendor: str | None = None
    version: str | None = None
    scopes: tuple[str, ...] = ()
    menu: tuple[tuple[str, str], ...] = ()


def _pending(table: str, label: str, statuses: tuple[str, ...] = ("PENDING", "RETURNED")) -> OpenWork:
    states = ", ".join(f"'{s}'" for s in statuses)
    return OpenWork(label, f"SELECT count(*) FROM {table} WHERE tenant_id = %(tenant)s AND status IN ({states})")


CORE_ACTIONS = frozenset(
    {
        "my_tenants",
        "verify_audit_chain",
        "audit_log_detail",
        "audit_anchors",
        "audit_anchor_verify",
        "audit_anchor_now",
        "obs_logs",
        "backup_runs",
        "notification_prefs",
        "save_notification_pref",
        "delete_notification_pref",
        "send_test_notification",
        "my_deliveries",
        "queue_overview",
        "queue_retry",
        "queue_verify",
        "check_pii",
        "admin_save",
        "admin_close",
        "create_person_accounts",
        "delete_person",
        "admin_import",
        "admin_import_template",
        "modules",
        "module_enable",
        "module_disable",
        "module_install",
        "module_uninstall",
        "legal_status",
        "legal_application",
        "legal_verify",
        "transfer_ownership",
        "create_subsidiary",
        "ext_register",
        "api_catalog",
        "api_key_create",
        "api_key_revoke",
        "ext_rotate_key",
        "ext_launch",
        # Nhắn tin và lịch công tác (ADR #65): cộng tác hằng ngày thuộc phần lõi, luôn bật
        "chat_open_direct",
        "chat_create_group",
        "chat_update_group",
        "chat_leave",
        "calendar_events",
        "calendar_save",
        "calendar_cancel",
        "calendar_respond",
    }
)

CATALOG: tuple[Module, ...] = (
    Module(
        "approval",
        "Phê duyệt",
        "Chuỗi duyệt theo hạn mức, hộp việc, ủy quyền duyệt; nền cho các loại chứng từ cần duyệt",
        actions=frozenset({"act_on_task"}),
        open_work=(
            OpenWork(
                "việc duyệt đang mở",
                "SELECT count(*) FROM wf.task WHERE tenant_id = %(tenant)s AND status = 'OPEN'",
            ),
        ),
    ),
    Module(
        "procurement",
        "Mua sắm",
        "Đề nghị mua sắm, nhà cung cấp đề xuất, phiếu in; quy trình duyệt chạy trên Flowable",
        depends=("approval",),
        services=("flowable",),
        actions=frozenset(
            {
                "submit_purchase_request",
                "cancel_purchase_request",
                "process_state",
                "get_purchase_request_pdf",
                "proposed_partners",
                "adopt_proposed_partner",
            }
        ),
        open_work=(_pending("proc.purchase_request", "đề nghị mua sắm chờ duyệt hoặc bị trả về"),),
    ),
    Module(
        "ic",
        "Đơn hàng nội bộ",
        "Mua bán giữa các công ty trong tập đoàn, xác nhận và xuất lô",
        depends=("procurement",),
        actions=frozenset({"confirm_ic_order", "reject_ic_order", "cancel_ic_order"}),
        open_work=(_pending("ic.ic_order", "đơn hàng nội bộ chờ xác nhận", ("PENDING",)),),
    ),
    Module(
        "hr",
        "Nghiệp vụ nhân sự",
        "Tiếp nhận nhân sự, điều chuyển (cả giữa các công ty), quyết định nhân sự",
        depends=("approval",),
        actions=frozenset(
            {
                "save_onboarding_private",
                "reveal_onboarding_private",
                "submit_onboarding_request",
                "cancel_onboarding_request",
                "retry_onboarding_account",
                "issue_personnel_decision",
                "get_personnel_decision_pdf",
                "personnel_decisions",
                "personnel_decision_context",
                "create_transfer_request",
                "submit_transfer_request",
                "choose_transfer_position",
                "cancel_transfer_request",
                "create_transfer_out",
                "submit_transfer_out",
                "cancel_transfer_out",
                "choose_transfer_in_position",
                "transfer_tenants",
                "transfer_target_units",
            }
        ),
        open_work=(
            _pending("hr.onboarding_request", "hồ sơ tiếp nhận nhân sự chờ duyệt hoặc bị trả về"),
            _pending("hr.transfer_request", "đề nghị điều chuyển chờ duyệt hoặc bị trả về"),
            _pending("hr.transfer_out", "điều chuyển đi công ty khác chờ duyệt hoặc bị trả về"),
            _pending("hr.transfer_in", "điều chuyển đến từ công ty khác chờ duyệt hoặc bị trả về"),
        ),
    ),
    Module(
        "process",
        "Thiết kế & tự động hóa quy trình",
        "Vẽ quy trình BPMN, chạy thử, phát hành, quy trình tự động theo sự kiện và webhook",
        services=("flowable",),
        actions=frozenset(
            {
                "process_models",
                "process_model_get",
                "process_model_validate",
                "process_model_save",
                "process_model_publish",
                "process_model_delete",
                "process_from_document",
                "process_regulation_draft",
                "process_version_get",
                "process_sandbox_run",
                "process_script_test",
                "process_change_request_create",
                "process_change_request_resolve",
                "process_automation_enable",
                "process_automation_disable",
                "process_automation_start",
                "process_automation_webhook",
                "process_automation_events",
            }
        ),
        open_work=(
            OpenWork(
                "quy trình tự động đang bật",
                "SELECT count(*) FROM wf.process_automation WHERE tenant_id = %(tenant)s AND status = 'ACTIVE'",
            ),
        ),
    ),
    Module(
        "files",
        "Ổ đĩa & tệp đính kèm",
        "Ổ đĩa tài liệu, đính kèm tệp vào chứng từ, quét virus trước khi nhận",
        actions=frozenset({"get_upload_url", "confirm_upload", "get_download_url", "delete_attachment", "drive_usage"}),
    ),
    Module(
        "search",
        "Tìm kiếm toàn văn",
        "Tìm trong chứng từ và nội dung tệp, gõ không dấu được (Meilisearch, Apache Tika)",
        services=("meilisearch", "search-sync", "tika-core"),
        actions=frozenset({"search_documents"}),
    ),
    Module(
        "knowledge",
        "Thư viện tri thức",
        "Đề xuất, duyệt và tra cứu quy chế, tài liệu nội bộ",
        depends=("approval", "files", "search"),
        actions=frozenset(
            {"submit_kb_document", "cancel_kb_document", "retire_kb_document", "kb_reindex", "kb_library"}
        ),
        open_work=(_pending("collab.kb_document", "đề xuất tài liệu chờ duyệt hoặc bị trả về"),),
    ),
    Module(
        "ledger",
        "Sổ cái",
        "Đối soát sổ cái chống sửa, lưu trữ dài hạn",
        actions=frozenset({"ledger_overview", "ledger_verify", "ledger_archive", "ledger_open_archive"}),
    ),
    Module(
        "data",
        "Dữ liệu số",
        "Trung tâm điều hành, bản sao số, KPI, Lakehouse và dịch vụ dữ liệu (Kafka, Debezium, Trino)",
        services=("kafka", "debezium", "lakehouse-sink", "trino-core", "mosquitto", "iot-bridge"),
        actions=frozenset(
            {
                "lakehouse_datasets",
                "lakehouse_preview",
                "semantic_catalog",
                "semantic_query",
                "lineage_refresh",
                "lineage_graph",
                "ops_dashboard",
                "iot_acknowledge",
                "iot_entities",
                "iot_ingest",
                "iot_mqtt_account_create",
                "iot_mqtt_account_revoke",
                "kpi_snapshots",
                "get_kpi_report_pdf",
            }
        ),
    ),
    Module(
        "project",
        "Quản lý dự án",
        "Kế hoạch dự án chi tiết, WBS, phụ thuộc, sơ đồ Gantt, đường găng, báo cáo tiến độ theo kỳ",
        actions=frozenset(
            {
                "pm_project_detail",
                "pm_project_save",
                "pm_members_set",
                "pm_task_save",
                "pm_task_delete",
                "pm_task_reorder",
                "pm_baseline_set",
                "pm_report_create",
                "pm_plan_pdf",
                "pm_report_pdf",
            }
        ),
        open_work=(
            OpenWork(
                "dự án đang lập kế hoạch hoặc đang thực hiện",
                "SELECT count(*) FROM pm.project WHERE tenant_id = %(tenant)s AND status IN ('PLANNING', 'ACTIVE')",
            ),
        ),
    ),
    Module(
        "ai",
        "Trí tuệ số",
        "Trợ lý hỏi đáp trên tài liệu, tác tử AI, OCR tiếng Việt; chạy mô hình cục bộ (Ollama), cần nhiều RAM",
        depends=("files", "search"),
        services=("ollama-core", "ocr-core", "ai-worker"),
        actions=frozenset(
            {
                "ai_ask",
                "ai_assistants",
                "ai_models",
                "ai_agent_stats",
                "ai_agent_register",
                "ai_agent_update",
                "ai_agent_unregister",
                "ai_agent_automation",
                "ai_agent_trigger_options",
                "ocr_retry",
                "ocr_document",
            }
        ),
    ),
)

BY_CODE = {m.code: m for m in CATALOG}
ACTION_MODULE = {action: m.code for m in CATALOG for action in m.actions}
MANAGED_SERVICES = tuple(dict.fromkeys(s for m in CATALOG for s in m.services))  # thứ tự khởi động theo danh mục


def closure(codes, edges) -> list[str]:
    """Các mã cùng mọi mã với tới được theo `edges` (mã -> các mã liền kề), giữ thứ tự phụ thuộc trước."""
    out: list[str] = []

    def visit(code: str) -> None:
        if code in out:
            return
        for nxt in edges(code):
            visit(nxt)
        out.append(code)

    for code in codes:
        visit(code)
    return out


def requires(code: str, catalog: dict[str, Module] = BY_CODE) -> list[str]:
    """Mô-đun cùng mọi mô-đun nó phụ thuộc (trực tiếp hoặc gián tiếp), phụ thuộc đứng trước."""
    return closure([code], lambda c: catalog[c].depends)


def dependents(code: str, catalog: dict[str, Module] = BY_CODE) -> set[str]:
    """Mô-đun phụ thuộc (trực tiếp hoặc gián tiếp) vào `code`."""
    return {c for c in catalog if c != code and code in requires(c, catalog)}


def load_catalog(conn: psycopg.Connection) -> dict[str, Module]:
    """Mô-đun dựng sẵn cùng mô-đun ngoài đã đăng ký trên máy (ADR #58)."""
    catalog = dict(BY_CODE)
    for row in conn.execute(
        """SELECT module, name, description, vendor, version, depends, scopes, menu
           FROM core.external_module ORDER BY name"""
    ):
        code, name, description, vendor, version, depends, scopes, menu = row
        catalog[code] = Module(
            code,
            name,
            description,
            depends=tuple(d for d in depends if d in BY_CODE),
            external=True,
            vendor=vendor,
            version=version,
            scopes=tuple(scopes),
            menu=tuple((m["label"], m["path"]) for m in menu),
        )
    return catalog


def enabled_modules(conn: psycopg.Connection, tenant) -> set[str]:
    return {r[0] for r in conn.execute("SELECT module FROM core.tenant_module WHERE tenant_id = %s", (tenant,))}


def installed_modules(conn: psycopg.Connection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT module FROM core.module_install")}


def require_action(conn: psycopg.Connection, session: dict, action: str) -> None:
    """Chặn Action của mô-đun chưa bật cho tenant trong phiên. Action lõi và Action không gắn tenant luôn qua."""
    code = ACTION_MODULE.get(action)
    tenant = session.get("x-hasura-tenant-id")
    if code is None or not tenant:
        return
    if not conn.execute("SELECT core.module_enabled(%s, %s)", (tenant, code)).fetchone()[0]:
        raise ActionError(
            f"Chức năng {BY_CODE[code].name} chưa được bật cho công ty. Quản trị viên bật ở trang Quản lý chức năng.",
            "module-disabled",
            403,
        )


def desired_services(conn: psycopg.Connection) -> dict:
    """Container nào phải chạy, container nào phải dừng theo các mô-đun đã cài (cho sleeper đối chiếu)."""
    installed = installed_modules(conn)
    run = list(dict.fromkeys(s for m in CATALOG if m.code in installed for s in m.services))
    return {"run": run, "stop": [s for s in MANAGED_SERVICES if s not in run]}


def _service_status(ctx: Context) -> dict | None:
    """Trạng thái container từ sleeper; None khi không hỏi được (máy dev không chạy Docker)."""
    if not ctx.sleeper_url:
        return None
    try:
        resp = httpx.get(f"{ctx.sleeper_url.rstrip('/')}/status", timeout=3.0)
        resp.raise_for_status()
        return resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("không hỏi được trạng thái container từ sleeper: %s", exc)
        return None


class Manager:
    def __init__(self, conn: psycopg.Connection, session: dict, ctx: Context):
        self.conn = conn
        self.ctx = ctx
        self.person = session.get("x-hasura-user-id")
        self.tenant = session.get("x-hasura-tenant-id")
        if not self.person or not self.tenant:
            raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
        self.catalog = load_catalog(conn)
        # chủ sở hữu công ty khởi tạo máy chủ tự cài (ADR #57) cài/gỡ mô-đun trên máy như quản trị nền tảng
        self.platform = (
            session.get("x-hasura-role") == "platform_admin"
            or conn.execute(
                "SELECT EXISTS (SELECT FROM core.tenant_owner WHERE tenant_id = %s AND person_id = %s AND platform)",
                (self.tenant, self.person),
            ).fetchone()[0]
        )

    def can_manage(self) -> bool:
        return self.conn.execute(
            """SELECT EXISTS (SELECT FROM core.v_permission_grant
                              WHERE tenant_id = %s AND person_id = %s AND permission_code = %s
                                AND valid_period @> now())""",
            (self.tenant, self.person, MANAGE),
        ).fetchone()[0]

    def require_manage(self) -> None:
        if not self.can_manage():
            raise ActionError(f"Bạn không có quyền {MANAGE}", "forbidden", 403)

    def require_platform(self) -> None:
        if not self.platform:
            raise ActionError(
                "Cài hoặc gỡ mô-đun trên máy cần tài khoản quản trị nền tảng (vai trò platform_admin)", "forbidden", 403
            )

    def module(self, code: str) -> Module:
        if code not in self.catalog:
            raise ActionError(f"Không có mô-đun {code}", "not-found", 404)
        return self.catalog[code]

    def lock(self) -> None:
        """Mọi thay đổi trạng thái mô-đun chạy tuần tự, tránh hai quản trị viên bật/tắt chéo nhau."""
        self.conn.execute("SELECT pg_advisory_xact_lock(hashtext('core.module'))")

    def overview(self) -> dict:
        installed = installed_modules(self.conn)
        enabled = enabled_modules(self.conn, self.tenant)
        status = _service_status(self.ctx) if self.platform else None
        return {
            "can_manage": self.can_manage(),
            "can_install": self.platform,
            "modules": [
                {
                    "code": m.code,
                    "name": m.name,
                    "description": m.description,
                    "depends": list(m.depends),
                    "dependents": sorted(dependents(m.code, self.catalog)),
                    "services": [
                        {
                            "name": s,
                            "running": None if status is None else (status.get(s) or {}).get("running"),
                        }
                        for s in m.services
                    ],
                    "installed": m.code in installed,
                    "enabled": m.code in enabled,
                    "external": m.external,
                    "vendor": m.vendor,
                    "version": m.version,
                    "scopes": list(m.scopes),
                    "menu": [{"label": label, "path": path} for label, path in m.menu],
                }
                for m in self.catalog.values()
            ],
        }

    def _check_services(self, codes: list[str]) -> None:
        """Mô-đun cần container mà máy chưa tạo (ví dụ dựng bằng compose cũ thiếu dịch vụ) thì không cài được."""
        status = _service_status(self.ctx)
        if status is None:
            return
        missing = [
            s for c in codes for s in self.catalog[c].services if s in status and status[s].get("running") is None
        ]
        if missing:
            raise ActionError(
                f"Máy chủ chưa có container {', '.join(sorted(set(missing)))}: chạy lại `docker compose up -d` "
                "(hoặc `make up`) rồi cài lại",
                "service-missing",
                409,
            )

    def install(self, code: str) -> list[str]:
        self.require_platform()
        self.module(code)
        self.lock()
        todo = [c for c in requires(code, self.catalog) if c not in installed_modules(self.conn)]
        self._check_services(todo)
        for c in todo:
            self.conn.execute(
                "INSERT INTO core.module_install (module, installed_by) VALUES (%s, %s)", (c, f"person:{self.person}")
            )
        return todo

    def uninstall(self, code: str) -> list[str]:
        self.require_platform()
        m = self.module(code)
        self.lock()
        installed = installed_modules(self.conn)
        if code not in installed:
            return []
        users = sorted(dependents(code, self.catalog) & installed)
        if users:
            raise ActionError(
                f"Không gỡ được {m.name}: mô-đun {', '.join(self.catalog[c].name for c in users)} đang dựa vào nó",
                "module-in-use",
                409,
            )
        tenants = [
            r[0]
            for r in self.conn.execute(
                """SELECT t.name FROM core.tenant_module tm JOIN core.tenant t ON t.id = tm.tenant_id
                   WHERE tm.module = %s ORDER BY t.name""",
                (code,),
            )
        ]
        if tenants:
            raise ActionError(
                f"Không gỡ được {m.name}: công ty {', '.join(tenants)} đang bật; tắt ở các công ty đó trước",
                "module-in-use",
                409,
            )
        self.conn.execute("DELETE FROM core.module_install WHERE module = %s", (code,))
        return [code]

    def enable(self, code: str) -> list[str]:
        self.require_manage()
        self.module(code)
        self.lock()
        chain = requires(code, self.catalog)
        missing = [c for c in chain if c not in installed_modules(self.conn)]
        if missing:
            if not self.platform:
                raise ActionError(
                    f"Mô-đun {', '.join(self.catalog[c].name for c in missing)} chưa được cài trên máy chủ; "
                    "nhờ quản trị nền tảng cài trước",
                    "module-not-installed",
                    409,
                )
            self.install(code)
        enabled = enabled_modules(self.conn, self.tenant)
        todo = [c for c in chain if c not in enabled]
        for c in todo:
            self.conn.execute(
                "INSERT INTO core.tenant_module (tenant_id, module, enabled_by) VALUES (%s, %s, %s)",
                (self.tenant, c, self.person),
            )
        return todo

    def disable(self, code: str) -> list[str]:
        self.require_manage()
        m = self.module(code)
        self.lock()
        enabled = enabled_modules(self.conn, self.tenant)
        if code not in enabled:
            return []
        users = sorted(dependents(code, self.catalog) & enabled)
        if users:
            raise ActionError(
                f"Không tắt được {m.name}: mô-đun {', '.join(self.catalog[c].name for c in users)} đang bật và dựa vào nó; "
                "tắt các mô-đun đó trước",
                "module-in-use",
                409,
            )
        busy = []
        for work in m.open_work:
            n = self.conn.execute(work.sql, {"tenant": self.tenant}).fetchone()[0]
            if n:
                busy.append(f"{n} {work.label}")
        if busy:
            raise ActionError(
                f"Không tắt được {m.name}: còn {'; '.join(busy)}. Xử lý xong (duyệt, từ chối hoặc hủy) rồi tắt lại",
                "module-busy",
                409,
            )
        self.conn.execute("DELETE FROM core.tenant_module WHERE tenant_id = %s AND module = %s", (self.tenant, code))
        return [code]


def _change(method: str):
    """Action đổi trạng thái: trả tổng quan mới kèm các mô-đun vừa đổi (`changed`)."""

    def handler(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
        manager = Manager(conn, session, ctx)
        changed = getattr(manager, method)(args["code"])
        return {**manager.overview(), "changed": changed}

    return handler


HANDLERS = {
    "modules": lambda conn, session, args, ctx: {**Manager(conn, session, ctx).overview(), "changed": []},
    "module_enable": _change("enable"),
    "module_disable": _change("disable"),
    "module_install": _change("install"),
    "module_uninstall": _change("uninstall"),
}
