# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

import argparse
import json
import pathlib
from collections import defaultdict

import psycopg

from . import config

SCHEMAS = (
    "core",
    "mdm",
    "wf",
    "proc",
    "ic",
    "mfg",
    "collab",
    "audit",
    "hr",
    "iot",
    "meta",
    "kpi",
    "live",
    "api",
    "chat",
    "cal",
    "pm",
)
HIDDEN = {
    ("wf", "flow_sync"),
    ("wf", "v_flow_state"),
    ("core", "doc_sequence"),
    ("audit", "chain_head"),
    ("hr", "private_access"),
    ("audit", "ledger_check"),
    ("audit", "archive_access"),
    ("hr", "personnel_decision"),
    ("kpi", "snapshot"),
    ("wf", "process_change_request"),
    ("wf", "process_automation"),
    ("wf", "process_regulation"),
    ("wf", "automation_run"),
    ("collab", "notification_pref"),
    ("collab", "person_locale"),
    ("audit", "anchor"),
    ("audit", "backup_run"),
    ("obs", "log_event"),
    ("core", "setup_code"),
    ("core", "setup_application"),
    ("core", "legal_verification"),
    ("core", "module_install"),
    ("core", "login_device"),
    ("core", "external_module"),
    ("cal", "reminder_sent"),
}
ROLE = "user"
ADMIN_ROLE = "platform_admin"
ACCOUNT_ROLE = "account"
ME = "X-Hasura-User-Id"
TENANT = {"tenant_id": {"_eq": "X-Hasura-Tenant-Id"}}
POOL_MAX_CONNECTIONS = 20

ADMIN_ONLY = {("core", "tenant_relation")}

IS_ADMIN = {
    "_exists": {
        "_table": {"schema": "core", "name": "v_admin"},
        "_where": {"_and": [{"person_id": {"_eq": ME}}, {"tenant_id": {"_eq": "X-Hasura-Tenant-Id"}}]},
    }
}
IS_AI_ADMIN = {
    "_exists": {
        "_table": {"schema": "core", "name": "v_ai_admin"},
        "_where": {"_and": [{"person_id": {"_eq": ME}}, {"tenant_id": {"_eq": "X-Hasura-Tenant-Id"}}]},
    }
}
ADMIN_READ = {
    ("core", "role"),
    ("core", "role_permission"),
    ("core", "role_grant"),
    ("core", "team"),
    ("core", "team_member"),
}

CAN_READ = {
    ("proc", "purchase_request"): ("proc", "purchase_request_can_read"),
    ("wf", "approval_step"): ("wf", "approval_step_can_read"),
    ("wf", "approval_history"): ("wf", "approval_history_can_read"),
    ("wf", "task"): ("wf", "task_can_read"),
    ("collab", "comment"): ("collab", "comment_can_read"),
    ("core", "attachment"): ("core", "attachment_can_read"),
    ("hr", "onboarding_request"): ("hr", "onboarding_request_can_read"),
    ("hr", "transfer_request"): ("hr", "transfer_request_can_read"),
    ("hr", "transfer_out"): ("hr", "transfer_out_can_read"),
    ("hr", "transfer_in"): ("hr", "transfer_in_can_read"),
    ("hr", "transfer_group"): ("hr", "transfer_group_can_read"),
    ("ic", "ic_order"): ("ic", "ic_order_can_read"),
    ("proc", "purchase_order"): ("proc", "purchase_order_can_read"),
    ("collab", "kb_document"): ("collab", "kb_document_can_read"),
    ("chat", "conversation"): ("chat", "conversation_can_read"),
    ("cal", "event"): ("cal", "event_can_read"),
    ("pm", "project"): ("pm", "project_can_read"),
}

ROW_COMPUTED = {
    ("pm", "project"): [
        (
            "stats",
            ("pm", "project_stats"),
            "Số liệu tiến độ: actual_pct, planned_pct, spi, late_tasks, total_tasks, done_tasks (một lần tính, ADR #67)",
        ),
    ],
    ("core", "attachment"): [
        ("para", ("core", "attachment_para"), "PROJECTS | AREAS | RESOURCES | ARCHIVES theo trạng thái chứng từ"),
    ],
    ("api", "api_key"): [
        ("last_used_at", ("api", "api_key_last_used_at"), "Lần gọi gần nhất"),
        ("last_ip", ("api", "api_key_last_ip"), "IP của lần gọi gần nhất"),
    ],
}

EXTRA_COMPUTED = {
    ("pm", "project"): [("can_manage", ("pm", "project_can_manage"), "Người gọi sửa được kế hoạch dự án không")],
    ("chat", "conversation"): [
        ("unread", ("chat", "conversation_unread"), "Số tin chưa đọc của người gọi"),
        (
            "display_name",
            ("chat", "conversation_display_name"),
            "Tên hiển thị theo người xem (cuộc hai người: tên người kia)",
        ),
    ],
    ("kpi", "chart"): [("is_mine", ("kpi", "chart_is_mine"), "Biểu đồ BI do người gọi tạo (sửa, xóa được)")],
    ("hr", "onboarding_request"): [
        (
            "can_read_private",
            ("hr", "onboarding_request_can_read_private"),
            "Người gọi được xem bản rõ CCCD, số tài khoản, địa chỉ không",
        )
    ],
    ("ic", "ic_order"): [
        (
            "can_confirm",
            ("ic", "ic_order_can_confirm"),
            "Người gọi xác nhận / từ chối được đơn hàng nội bộ đang chờ không",
        )
    ],
}

HIDDEN_COLUMNS = {
    ("core", "attachment"): {"storage_key"},
    ("core", "person"): {"birth_year"},
    ("core", "attachment_ocr"): {"page_texts", "pages", "attempts", "next_attempt_at"},
    ("core", "ai_question"): {"context_key", "attempts"},
    ("api", "api_key"): {"key_sha256"},
    ("hr", "onboarding_request"): {
        "national_id_enc",
        "bank_account_enc",
        "address_enc",
        "initial_password_enc",
        "account_attempts",
    },
    ("audit", "log"): {"old_data", "new_data"},
}

SELECT_FILTER = {
    ("core", "tenant"): {"id": {"_eq": "X-Hasura-Tenant-Id"}},
    ("core", "permission"): {},
    ("core", "delegation"): {"_and": [TENANT, {"_or": [{"delegator_id": {"_eq": ME}}, {"delegate_id": {"_eq": ME}}]}]},
    ("wf", "v_inbox"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("core", "v_permission_grant"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("collab", "notification"): {"_and": [TENANT, {"recipient_id": {"_eq": ME}}]},
    ("audit", "log"): {"_and": [TENANT, {"readers": {"person_id": {"_eq": ME}}}]},
    ("audit", "v_reader"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("core", "v_admin"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("iot", "model"): {},
    ("meta", "lineage_node"): {},
    ("meta", "lineage_edge"): {},
    ("kpi", "pin"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("live", "presence"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("meta", "quality_check"): {"_or": [{"tenant_id": {"_is_null": True}}, TENANT]},
    ("meta", "pipeline_run"): {"_or": [{"tenant_id": {"_is_null": True}}, TENANT]},
    ("api", "api_key"): {"_and": [TENANT, IS_ADMIN]},
    ("api", "usage"): {"key": {"_and": [TENANT, IS_ADMIN]}},
    ("kpi", "chart"): {"_and": [TENANT, {"_or": [{"person_id": {"_eq": ME}}, {"shared": {"_eq": True}}]}]},
    ("core", "v_ai_admin"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("chat", "member"): {"_and": [TENANT, {"conversation": {"can_read": {"_eq": True}}}]},
    ("chat", "message"): {"_and": [TENANT, {"conversation": {"can_read": {"_eq": True}}}]},
    ("cal", "attendee"): {"_and": [TENANT, {"event": {"can_read": {"_eq": True}}}]},
    **{
        ("pm", t): {"_and": [TENANT, {"project": {"can_read": {"_eq": True}}}]}
        for t in ("member", "task", "dependency", "report")
    },
    ("core", "ai_agent"): {"_and": [TENANT, IS_AI_ADMIN]},
    ("core", "ai_agent_run"): {"_and": [TENANT, IS_AI_ADMIN]},
    ("iot", "mqtt_account"): {"_and": [TENANT, IS_ADMIN]},
    ("core", "ai_question"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("core", "attachment_ocr"): {"_and": [TENANT, {"attachment": {"can_read": {"_eq": True}}}]},
    **{key: {"_and": [TENANT, IS_ADMIN]} for key in ADMIN_READ},
    ("proc", "purchase_request_item"): {"_and": [TENANT, {"request": {"can_read": {"_eq": True}}}]},
    ("ic", "ic_order_item"): {"_and": [TENANT, {"order": {"can_read": {"_eq": True}}}]},
    ("proc", "purchase_order_item"): {"_and": [TENANT, {"order": {"can_read": {"_eq": True}}}]},
}

MODULE_TABLES = {
    **{
        ("proc", t): "procurement"
        for t in ("purchase_request", "purchase_request_item", "purchase_order", "purchase_order_item")
    },
    **{("ic", t): "ic" for t in ("ic_order", "ic_order_item")},
    **{
        ("hr", t): "hr"
        for t in ("onboarding_request", "transfer_request", "transfer_out", "transfer_in", "transfer_group")
    },
    **{("wf", t): "process" for t in ("process_model", "process_version", "sandbox_run")},
    ("collab", "kb_document"): "knowledge",
    **{("iot", t): "data" for t in ("entity", "incident", "measurement", "model", "site", "mqtt_account")},
    **{("kpi", t): "data" for t in ("chart", "definition", "pin", "value")},
    **{("meta", t): "data" for t in ("data_issue", "lineage_edge", "lineage_node", "pipeline_run", "quality_check")},
    **{("core", t): "ai" for t in ("ai_agent", "ai_agent_run", "ai_question", "attachment_ocr")},
    **{("pm", t): "project" for t in ("project", "member", "task", "dependency", "report")},
}


def module_on(code: str) -> dict:
    return {
        "_exists": {
            "_table": {"schema": "core", "name": "tenant_module"},
            "_where": {"_and": [{"tenant_id": {"_eq": "X-Hasura-Tenant-Id"}}, {"module": {"_eq": code}}]},
        }
    }


def _gate_modules(entries: dict) -> None:
    done = set()
    for key, code in MODULE_TABLES.items():
        entry = entries[key]
        for kind, field in (
            ("select_permissions", "filter"),
            ("insert_permissions", "check"),
            ("update_permissions", "filter"),
            ("delete_permissions", "filter"),
        ):
            for perm in entry.get(kind, []):
                body = perm["permission"]
                if id(body) in done:
                    continue
                done.add(id(body))
                body[field] = {"_and": [body[field], module_on(code)]} if body.get(field) else module_on(code)


MANUAL_RELATIONSHIPS = [
    ("object", ("wf", "approval_step"), "purchase_request", ("proc", "purchase_request"), {"entity_id": "id"}),
    ("object", ("wf", "approval_history"), "purchase_request", ("proc", "purchase_request"), {"entity_id": "id"}),
    ("array", ("proc", "purchase_request"), "approval_steps", ("wf", "approval_step"), {"id": "entity_id"}),
    ("array", ("proc", "purchase_request"), "approval_history", ("wf", "approval_history"), {"id": "entity_id"}),
    ("object", ("wf", "v_inbox"), "purchase_request", ("proc", "purchase_request"), {"entity_id": "id"}),
    ("object", ("wf", "v_inbox"), "task", ("wf", "task"), {"task_id": "id"}),
    ("object", ("wf", "v_inbox"), "assigned_position", ("core", "position"), {"assigned_position_id": "id"}),
    ("object", ("collab", "comment"), "purchase_request", ("proc", "purchase_request"), {"entity_id": "id"}),
    ("array", ("proc", "purchase_request"), "comments", ("collab", "comment"), {"id": "entity_id"}),
    ("object", ("collab", "notification"), "purchase_request", ("proc", "purchase_request"), {"entity_id": "id"}),
    ("object", ("audit", "log"), "actor", ("core", "person"), {"actor_id": "id"}),
    ("array", ("proc", "purchase_request"), "attachments", ("core", "attachment"), {"id": "entity_id"}),
    ("array", ("audit", "log"), "readers", ("audit", "v_reader"), {"tenant_id": "tenant_id"}),
    ("object", ("wf", "approval_step"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("object", ("wf", "approval_history"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("array", ("hr", "onboarding_request"), "approval_steps", ("wf", "approval_step"), {"id": "entity_id"}),
    ("array", ("hr", "onboarding_request"), "approval_history", ("wf", "approval_history"), {"id": "entity_id"}),
    ("object", ("wf", "v_inbox"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("object", ("collab", "comment"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("array", ("hr", "onboarding_request"), "comments", ("collab", "comment"), {"id": "entity_id"}),
    ("object", ("collab", "notification"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("array", ("hr", "onboarding_request"), "attachments", ("core", "attachment"), {"id": "entity_id"}),
    ("object", ("wf", "approval_step"), "transfer_request", ("hr", "transfer_request"), {"entity_id": "id"}),
    ("object", ("wf", "approval_history"), "transfer_request", ("hr", "transfer_request"), {"entity_id": "id"}),
    ("array", ("hr", "transfer_request"), "approval_steps", ("wf", "approval_step"), {"id": "entity_id"}),
    ("array", ("hr", "transfer_request"), "approval_history", ("wf", "approval_history"), {"id": "entity_id"}),
    ("object", ("wf", "v_inbox"), "transfer_request", ("hr", "transfer_request"), {"entity_id": "id"}),
    *[
        rel
        for leg in ("transfer_out", "transfer_in", "transfer_group")
        for rel in (
            ("object", ("wf", "approval_step"), leg, ("hr", leg), {"entity_id": "id"}),
            ("object", ("wf", "approval_history"), leg, ("hr", leg), {"entity_id": "id"}),
            ("array", ("hr", leg), "approval_steps", ("wf", "approval_step"), {"id": "entity_id"}),
            ("array", ("hr", leg), "approval_history", ("wf", "approval_history"), {"id": "entity_id"}),
            ("object", ("wf", "v_inbox"), leg, ("hr", leg), {"entity_id": "id"}),
        )
    ],
    ("object", ("collab", "comment"), "ic_order", ("ic", "ic_order"), {"entity_id": "id"}),
    ("array", ("ic", "ic_order"), "comments", ("collab", "comment"), {"id": "entity_id"}),
    ("object", ("collab", "notification"), "ic_order", ("ic", "ic_order"), {"entity_id": "id"}),
    ("object", ("wf", "approval_step"), "kb_document", ("collab", "kb_document"), {"entity_id": "id"}),
    ("object", ("wf", "approval_history"), "kb_document", ("collab", "kb_document"), {"entity_id": "id"}),
    ("array", ("collab", "kb_document"), "approval_steps", ("wf", "approval_step"), {"id": "entity_id"}),
    ("array", ("collab", "kb_document"), "approval_history", ("wf", "approval_history"), {"id": "entity_id"}),
    ("object", ("wf", "v_inbox"), "kb_document", ("collab", "kb_document"), {"entity_id": "id"}),
    ("object", ("collab", "comment"), "kb_document", ("collab", "kb_document"), {"entity_id": "id"}),
    ("array", ("collab", "kb_document"), "comments", ("collab", "comment"), {"id": "entity_id"}),
    ("object", ("collab", "notification"), "kb_document", ("collab", "kb_document"), {"entity_id": "id"}),
    ("array", ("collab", "kb_document"), "attachments", ("core", "attachment"), {"id": "entity_id"}),
    ("object", ("core", "attachment"), "ocr", ("core", "attachment_ocr"), {"id": "attachment_id"}),
]

PR_EDITABLE = [
    "title",
    "description",
    "category_code",
    "total_amount",
    "needed_by",
    "partner_id",
    "proposed_partner_name",
    "proposed_partner_tax_code",
]
KB_EDITABLE = ["title", "category", "scope", "summary", "toc", "effective_date", "supersedes_id"]
ITEM_EDITABLE = ["item_id", "line_no", "description", "uom", "quantity", "unit_price", "note"]
OB_EDITABLE = [
    "full_name",
    "gender",
    "date_of_birth",
    "work_email",
    "phone",
    "education",
    "major",
    "target_position_id",
    "start_date",
    "contract_type",
    "salary",
    "note",
    "bank_name",
    "username",
]
MDM_EDITABLE = {
    ("mdm", "partner"): ["code", "name", "tax_code", "address", "email", "phone", "internal_unit_id", "is_active"],
    ("mdm", "item"): ["code", "name", "uom", "category_code", "ref_price", "is_active"],
}


def _action(
    name: str, kind: str, args: list[tuple[str, str]], output: str, roles: list[str], comment: str, timeout: int = 30
) -> dict:
    return {
        "name": name,
        "definition": {
            "kind": "synchronous",
            "type": kind,
            "handler": f"{{{{ACTIONS_URL}}}}/actions/{name}",
            "arguments": [{"name": n, "type": t} for n, t in args],
            "output_type": output,
            "headers": [{"name": "x-actions-secret", "value_from_env": "ACTIONS_SECRET"}],
            "timeout": timeout,
        },
        "permissions": [{"role": r} for r in roles],
        "comment": comment,
    }


def _project_actions() -> list[dict]:
    """Quản lý dự án (ADR #66): đọc chi tiết, sửa kế hoạch, công việc, báo cáo, văn bản PDF; mô-đun `project`."""
    roles = [ROLE, ADMIN_ROLE]
    return [
        _action(
            "pm_project_detail",
            "query",
            [("id", "uuid!")],
            "ProjectDetail!",
            roles,
            "Dự án kèm WBS đã tính ngày, % của công việc tổng hợp, đường găng, dự trữ, số liệu tiến độ, báo cáo",
        ),
        _action(
            "pm_project_save",
            "mutation",
            [("project", "jsonb!")],
            "ProjectSaved!",
            roles,
            "Lập hoặc sửa dự án và văn bản kế hoạch",
        ),
        _action(
            "pm_members_set",
            "mutation",
            [("project_id", "uuid!"), ("members", "jsonb!")],
            "ProjectMembers!",
            roles,
            "Đặt thành viên và vai trò của dự án; đồng bộ nhóm nhắn tin của dự án",
        ),
        _action(
            "pm_task_save",
            "mutation",
            [("task", "jsonb!")],
            "ProjectTaskSaved!",
            roles,
            "Thêm hoặc sửa công việc, phụ thuộc; tự dời công việc phía sau cho thỏa phụ thuộc",
        ),
        _action(
            "pm_task_delete", "mutation", [("id", "uuid!")], "ProjectTaskDeleted!", roles, "Xóa công việc và cây con"
        ),
        _action(
            "pm_task_reorder",
            "mutation",
            [("id", "uuid!"), ("direction", "String!")],
            "ProjectTaskMoved!",
            roles,
            "Đổi thứ tự (up/down) hoặc cấp (indent/outdent) của công việc",
        ),
        _action(
            "pm_baseline_set",
            "mutation",
            [("project_id", "uuid!")],
            "ProjectBaseline!",
            roles,
            "Chốt đường cơ sở của kế hoạch",
        ),
        _action(
            "pm_report_create",
            "mutation",
            [("report", "jsonb!")],
            "ProjectReportCreated!",
            roles,
            "Lập báo cáo tiến độ theo kỳ (chụp số liệu, báo thành viên)",
        ),
        _action(
            "pm_plan_pdf",
            "query",
            [("project_id", "uuid!")],
            "ProjectPdf!",
            roles,
            "Văn bản kế hoạch dự án (PDF)",
            timeout=60,
        ),
        _action(
            "pm_report_pdf",
            "query",
            [("report_id", "uuid!")],
            "ProjectPdf!",
            roles,
            "Báo cáo tiến độ (PDF)",
            timeout=60,
        ),
    ]


PROJECT_TYPES = [
    {
        "name": "ProjectDetail",
        "fields": [
            {"name": "project", "type": "jsonb!"},
            {"name": "members", "type": "[jsonb!]!"},
            {"name": "tasks", "type": "[jsonb!]!"},
            {"name": "dependencies", "type": "[jsonb!]!"},
            {"name": "stats", "type": "jsonb!"},
            {"name": "reports", "type": "[jsonb!]!"},
            {"name": "can_manage", "type": "Boolean!"},
            {"name": "my_role", "type": "String"},
            {"name": "warnings", "type": "[String!]!"},
        ],
    },
    {"name": "ProjectSaved", "fields": [{"name": "id", "type": "uuid!"}, {"name": "created", "type": "Boolean!"}]},
    {"name": "ProjectMembers", "fields": [{"name": "members", "type": "Int!"}]},
    {"name": "ProjectTaskSaved", "fields": [{"name": "id", "type": "uuid!"}, {"name": "shifted", "type": "Int!"}]},
    {"name": "ProjectTaskDeleted", "fields": [{"name": "deleted", "type": "Int!"}]},
    {"name": "ProjectTaskMoved", "fields": [{"name": "id", "type": "uuid!"}]},
    {"name": "ProjectBaseline", "fields": [{"name": "tasks", "type": "Int!"}]},
    {
        "name": "ProjectReportCreated",
        "fields": [
            {"name": "id", "type": "uuid!"},
            {"name": "health", "type": "String!"},
            {"name": "planned_pct", "type": "Float"},
            {"name": "actual_pct", "type": "Float"},
            {"name": "spi", "type": "Float"},
            {"name": "late_tasks", "type": "Int"},
        ],
    },
    {
        "name": "ProjectPdf",
        "fields": [
            {"name": "file_name", "type": "String!"},
            {"name": "url", "type": "String!"},
            {"name": "check_code", "type": "String!"},
            {"name": "cached", "type": "Boolean!"},
            {"name": "expires_in", "type": "Int!"},
        ],
    },
]


def _attachment_rel() -> dict:
    return {
        "name": "attachment",
        "type": "object",
        "source": "bms",
        "remote_table": {"schema": "core", "name": "attachment"},
        "field_mapping": {"attachment_id": "id"},
    }


def introspect(conn: psycopg.Connection):
    tables = conn.execute(
        """SELECT n.nspname, c.relname, c.relkind
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = ANY(%s) AND c.relkind IN ('r', 'v')
           ORDER BY 1, 2""",
        (list(SCHEMAS),),
    ).fetchall()
    columns = defaultdict(set)
    for schema, table, column in conn.execute(
        """SELECT table_schema, table_name, column_name FROM information_schema.columns
           WHERE table_schema = ANY(%s)""",
        (list(SCHEMAS),),
    ):
        columns[(schema, table)].add(column)
    fks = conn.execute(
        """SELECT sn.nspname, s.relname, tn.nspname, t.relname, con.conname,
                  array_agg(sa.attname ORDER BY k.ord), array_agg(ta.attname ORDER BY k.ord)
           FROM pg_constraint con
           JOIN pg_class s ON s.oid = con.conrelid JOIN pg_namespace sn ON sn.oid = s.relnamespace
           JOIN pg_class t ON t.oid = con.confrelid JOIN pg_namespace tn ON tn.oid = t.relnamespace
           CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(src, dst, ord)
           JOIN pg_attribute sa ON sa.attrelid = s.oid AND sa.attnum = k.src
           JOIN pg_attribute ta ON ta.attrelid = t.oid AND ta.attnum = k.dst
           WHERE con.contype = 'f' AND sn.nspname = ANY(%s) AND tn.nspname = ANY(%s)
           GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, 2, 5""",
        (list(SCHEMAS), list(SCHEMAS)),
    ).fetchall()
    return tables, columns, fks


def _strip(column: str) -> str:
    for suffix in ("_id", "_code"):
        if column.endswith(suffix):
            return column[: -len(suffix)]
    return column


def _plural(name: str) -> str:
    return name if name.endswith("s") else name + "s"


def build(conn: psycopg.Connection) -> dict:
    tables, columns, fks = introspect(conn)
    visible = [(s, t, k) for s, t, k in tables if (s, t) not in HIDDEN]
    entries = {(s, t): {"table": {"schema": s, "name": t}} for s, t, _ in visible}

    def add_rel(kind, source, name, target, mapping):
        if source not in entries or target not in entries:
            return
        key = "object_relationships" if kind == "object" else "array_relationships"
        existing = {
            r["name"] for k in ("object_relationships", "array_relationships") for r in entries[source].get(k, [])
        }
        if name in existing:
            raise ValueError(f"Trùng tên quan hệ {name} trên {source}")
        entries[source].setdefault(key, []).append(
            {
                "name": name,
                "using": {
                    "manual_configuration": {
                        "remote_table": {"schema": target[0], "name": target[1]},
                        "column_mapping": mapping,
                    }
                },
            }
        )

    fk_count = defaultdict(int)
    for s, t, ts, tt, *_ in fks:
        fk_count[(s, t, ts, tt)] += 1

    late = ("chat", "cal", "pm")
    for s, t, ts, tt, _name, src_cols, dst_cols in sorted(fks, key=lambda f: f[0] in late):
        own = [c for c in src_cols if c != "tenant_id"] or list(src_cols)
        obj_name = _strip(own[-1])
        if obj_name in columns[(s, t)]:
            obj_name = f"{obj_name}_{tt}"
        mapping = dict(zip(src_cols, dst_cols, strict=True))
        add_rel("object", (s, t), obj_name, (ts, tt), mapping)
        if (ts, tt) == ("core", "tenant"):
            continue
        arr = _plural(t) if fk_count[(s, t, ts, tt)] == 1 else f"{_plural(t)}_by_{obj_name}"
        if (s, t) == (ts, tt):
            arr = "children" if obj_name == "parent" else f"{_plural(t)}_by_{obj_name}"
        taken = {
            r["name"]
            for k in ("object_relationships", "array_relationships")
            for r in entries.get((ts, tt), {}).get(k, [])
        }
        if arr in taken:
            arr = f"{s}_{arr}"
        add_rel("array", (ts, tt), arr, (s, t), {v: k for k, v in mapping.items()})

    for kind, source, name, target, mapping in MANUAL_RELATIONSHIPS:
        add_rel(kind, source, name, target, mapping)

    for key, (fs, fn) in CAN_READ.items():
        if key in entries:
            entries[key]["computed_fields"] = [
                {
                    "name": "can_read",
                    "definition": {"function": {"schema": fs, "name": fn}, "session_argument": "hasura_session"},
                    "comment": "Người gọi có được xem chứng từ không",
                }
            ]
    for key, fields in ROW_COMPUTED.items():
        for name, (fs, fn), comment in fields:
            entries[key].setdefault("computed_fields", []).append(
                {"name": name, "definition": {"function": {"schema": fs, "name": fn}}, "comment": comment}
            )
    for key, fields in EXTRA_COMPUTED.items():
        for name, (fs, fn), comment in fields:
            entries[key].setdefault("computed_fields", []).append(
                {
                    "name": name,
                    "definition": {"function": {"schema": fs, "name": fn}, "session_argument": "hasura_session"},
                    "comment": comment,
                }
            )

    for key, entry in entries.items():
        if key in ADMIN_ONLY:
            if "tenant_id" in columns[key]:
                entry["select_permissions"] = [
                    {"role": ADMIN_ROLE, "permission": {"columns": "*", "filter": TENANT, "allow_aggregations": True}}
                ]
            continue
        if key in SELECT_FILTER:
            flt = SELECT_FILTER[key]
        elif "tenant_id" in columns[key]:
            flt = TENANT
        else:
            continue
        cols = sorted(columns[key] - HIDDEN_COLUMNS[key]) if key in HIDDEN_COLUMNS else "*"
        perm = {"columns": cols, "filter": flt, "allow_aggregations": True}
        if key in CAN_READ:
            perm["filter"] = {"_and": [TENANT, {"can_read": {"_eq": True}}]}
            if "deleted_at" in columns[key] and key != ("collab", "comment"):
                perm["filter"]["_and"].append({"deleted_at": {"_is_null": True}})
            perm["computed_fields"] = [f["name"] for f in entry["computed_fields"]]
        elif key in EXTRA_COMPUTED or key in ROW_COMPUTED:
            perm["computed_fields"] = [f["name"] for f in entry["computed_fields"]]
        entry["select_permissions"] = [{"role": ROLE, "permission": perm}, {"role": ADMIN_ROLE, "permission": perm}]

    pr = entries[("proc", "purchase_request")]
    own_draft = {"_and": [TENANT, {"requester_id": {"_eq": ME}}, {"status": {"_in": ["DRAFT", "RETURNED"]}}]}
    pr["insert_permissions"] = [
        {
            "role": ROLE,
            "permission": {
                "check": {},
                "set": {"tenant_id": "X-Hasura-Tenant-Id", "requester_id": ME},
                "columns": ["requester_position_id", *PR_EDITABLE],
            },
        }
    ]
    pr["update_permissions"] = [
        {
            "role": ROLE,
            "permission": {
                "filter": own_draft,
                "check": {"status": {"_in": ["DRAFT", "RETURNED"]}},
                "columns": PR_EDITABLE,
            },
        }
    ]
    pr["delete_permissions"] = [
        {
            "role": ROLE,
            "permission": {
                "filter": {"_and": [TENANT, {"requester_id": {"_eq": ME}}, {"status": {"_eq": "DRAFT"}}]},
            },
        }
    ]

    kb = entries[("collab", "kb_document")]
    own_kb = {"_and": [TENANT, {"requester_id": {"_eq": ME}}, {"status": {"_in": ["DRAFT", "RETURNED"]}}]}
    kb["insert_permissions"] = [
        {
            "role": r,
            "permission": {
                "check": {},
                "set": {"tenant_id": "X-Hasura-Tenant-Id", "requester_id": ME},
                "columns": ["requester_position_id", *KB_EDITABLE],
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    kb["update_permissions"] = [
        {
            "role": r,
            "permission": {
                "filter": own_kb,
                "check": {"status": {"_in": ["DRAFT", "RETURNED"]}},
                "columns": KB_EDITABLE,
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    kb["delete_permissions"] = [
        {
            "role": r,
            "permission": {"filter": {"_and": [TENANT, {"requester_id": {"_eq": ME}}, {"status": {"_eq": "DRAFT"}}]}},
        }
        for r in (ROLE, ADMIN_ROLE)
    ]

    own_pin = {"_and": [TENANT, {"person_id": {"_eq": ME}}]}
    pin = entries[("kpi", "pin")]
    pin["insert_permissions"] = [
        {
            "role": r,
            "permission": {
                "check": {},
                "set": {"tenant_id": "X-Hasura-Tenant-Id", "person_id": ME},
                "columns": ["kpi_key", "position"],
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    pin["update_permissions"] = [
        {"role": r, "permission": {"filter": own_pin, "check": own_pin, "columns": ["position"]}}
        for r in (ROLE, ADMIN_ROLE)
    ]
    pin["delete_permissions"] = [{"role": r, "permission": {"filter": own_pin}} for r in (ROLE, ADMIN_ROLE)]

    own_presence = {"_and": [TENANT, {"person_id": {"_eq": ME}}]}
    presence = entries[("live", "presence")]
    presence["insert_permissions"] = [
        {
            "role": r,
            "permission": {
                "check": {},
                "set": {"tenant_id": "X-Hasura-Tenant-Id", "person_id": ME},
                "columns": ["device", "path"],
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    presence["update_permissions"] = [
        {"role": r, "permission": {"filter": own_presence, "check": own_presence, "columns": ["path"]}}
        for r in (ROLE, ADMIN_ROLE)
    ]
    presence["delete_permissions"] = [{"role": r, "permission": {"filter": own_presence}} for r in (ROLE, ADMIN_ROLE)]

    in_conversation = {"conversation": {"can_read": {"_eq": True}}}
    message = entries[("chat", "message")]
    message["insert_permissions"] = [
        {
            "role": r,
            "permission": {
                "check": {"_and": [TENANT, in_conversation]},
                "set": {"tenant_id": "X-Hasura-Tenant-Id", "sender_id": ME},
                "columns": ["conversation_id", "body", "attachment_id", "reply_to_id", "mentions"],
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    own_message = {"_and": [TENANT, {"sender_id": {"_eq": ME}}, {"deleted_at": {"_is_null": True}}]}
    message["update_permissions"] = [
        {"role": r, "permission": {"filter": own_message, "check": TENANT, "columns": ["body", "deleted_at"]}}
        for r in (ROLE, ADMIN_ROLE)
    ]
    own_member = {"_and": [TENANT, {"person_id": {"_eq": ME}}]}
    entries[("chat", "member")]["update_permissions"] = [
        {"role": r, "permission": {"filter": own_member, "check": own_member, "columns": ["last_read_id", "muted"]}}
        for r in (ROLE, ADMIN_ROLE)
    ]

    chart = entries[("kpi", "chart")]
    chart["insert_permissions"] = [
        {
            "role": r,
            "permission": {
                "check": {},
                "set": {"tenant_id": "X-Hasura-Tenant-Id", "person_id": ME},
                "columns": ["name", "chart_type", "spec", "shared"],
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    chart["update_permissions"] = [
        {
            "role": r,
            "permission": {"filter": own_pin, "check": own_pin, "columns": ["name", "chart_type", "spec", "shared"]},
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    chart["delete_permissions"] = [{"role": r, "permission": {"filter": own_pin}} for r in (ROLE, ADMIN_ROLE)]
    entries[("meta", "data_issue")]["insert_permissions"] = [
        {
            "role": r,
            "permission": {
                "check": {},
                "set": {"tenant_id": "X-Hasura-Tenant-Id", "reported_by": ME},
                "columns": ["node_id", "severity", "description"],
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]

    item = entries[("proc", "purchase_request_item")]
    own_item = {"_and": [TENANT, {"request": own_draft}]}
    item["insert_permissions"] = [
        {
            "role": ROLE,
            "permission": {
                "check": own_item,
                "set": {"tenant_id": "X-Hasura-Tenant-Id"},
                "columns": ["request_id", *ITEM_EDITABLE],
            },
        }
    ]
    item["update_permissions"] = [
        {
            "role": ROLE,
            "permission": {
                "filter": own_item,
                "check": own_item,
                "columns": ITEM_EDITABLE,
            },
        }
    ]
    item["delete_permissions"] = [{"role": ROLE, "permission": {"filter": own_item}}]

    comment = entries[("collab", "comment")]
    comment["insert_permissions"] = [
        {
            "role": r,
            "permission": {
                "check": {},
                "set": {"tenant_id": "X-Hasura-Tenant-Id", "author_id": ME},
                "columns": ["entity_type", "entity_id", "parent_id", "body", "mentions"],
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    comment["update_permissions"] = [
        {
            "role": r,
            "permission": {
                "filter": {"_and": [TENANT, {"author_id": {"_eq": ME}}, {"deleted_at": {"_is_null": True}}]},
                "check": {},
                "columns": ["body", "deleted_at"],
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]

    ob = entries[("hr", "onboarding_request")]
    own_ob = {"_and": [TENANT, {"requester_id": {"_eq": ME}}, {"status": {"_in": ["DRAFT", "RETURNED"]}}]}
    ob["insert_permissions"] = [
        {
            "role": r,
            "permission": {
                "check": {},
                "set": {"tenant_id": "X-Hasura-Tenant-Id", "requester_id": ME},
                "columns": ["requester_position_id", *OB_EDITABLE],
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    ob["update_permissions"] = [
        {
            "role": r,
            "permission": {
                "filter": own_ob,
                "check": {"status": {"_in": ["DRAFT", "RETURNED"]}},
                "columns": OB_EDITABLE,
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]
    ob["delete_permissions"] = [
        {
            "role": r,
            "permission": {
                "filter": {"_and": [TENANT, {"requester_id": {"_eq": ME}}, {"status": {"_eq": "DRAFT"}}]},
            },
        }
        for r in (ROLE, ADMIN_ROLE)
    ]

    for key, cols in MDM_EDITABLE.items():
        entries[key]["insert_permissions"] = [
            {
                "role": ADMIN_ROLE,
                "permission": {"check": {}, "set": {"tenant_id": "X-Hasura-Tenant-Id"}, "columns": cols},
            }
        ]
        entries[key]["update_permissions"] = [
            {"role": ADMIN_ROLE, "permission": {"filter": TENANT, "check": {}, "columns": cols}}
        ]

    _gate_modules(entries)

    return {
        "version": 3,
        "sources": [
            {
                "name": "bms",
                "kind": "postgres",
                "tables": [entries[k] for k in sorted(entries)],
                "functions": [
                    {
                        "function": {"schema": "collab", "name": "mark_notifications_read"},
                        "configuration": {"session_argument": "hasura_session", "exposed_as": "mutation"},
                        "permissions": [{"role": ROLE}, {"role": ADMIN_ROLE}],
                        "comment": "Đánh dấu đã đọc thông báo của người gọi (ids bỏ trống: tất cả)",
                    }
                ],
                "configuration": {
                    "connection_info": {
                        "database_url": {"from_env": "BMS_DATABASE_URL"},
                        "isolation_level": "read-committed",
                        "use_prepared_statements": True,
                        "pool_settings": {"max_connections": POOL_MAX_CONNECTIONS},
                    }
                },
            }
        ],
        "actions": [
            _action(
                "my_tenants",
                "query",
                [],
                "[AccountTenant!]!",
                [ACCOUNT_ROLE, ROLE, ADMIN_ROLE],
                "Các tenant tài khoản được vào (chọn tenant khi đăng nhập, ADR #30)",
                timeout=10,
            ),
            _action(
                "submit_purchase_request",
                "mutation",
                [("request_id", "uuid!")],
                "PurchaseRequestActionResult",
                [ROLE, ADMIN_ROLE],
                "Gửi duyệt đề nghị mua sắm (người lập)",
            ),
            _action(
                "act_on_task",
                "mutation",
                [("task_id", "uuid!"), ("decision", "ApprovalDecision!"), ("note", "String")],
                "PurchaseRequestActionResult",
                [ROLE, ADMIN_ROLE],
                "Duyệt / từ chối / trả về một việc duyệt (kể cả duyệt thay qua ủy quyền)",
            ),
            _action(
                "cancel_purchase_request",
                "mutation",
                [("request_id", "uuid!"), ("reason", "String!")],
                "PurchaseRequestActionResult",
                [ROLE, ADMIN_ROLE],
                "Người lập hủy đề nghị chưa duyệt xong (nháp, chờ duyệt, bị trả về)",
            ),
            _action(
                "process_state",
                "query",
                [("request_id", "uuid!")],
                "ProcessState",
                [ROLE, ADMIN_ROLE],
                "Sơ đồ BPMN và bước hiện tại của lần gửi duyệt gần nhất (cho trình xem sơ đồ)",
            ),
            _action(
                "verify_audit_chain",
                "query",
                [],
                "AuditChainResult!",
                [ROLE, ADMIN_ROLE],
                "Đối soát chuỗi hash nhật ký kiểm toán của tenant (cần quyền audit.read)",
                timeout=60,
            ),
            _action(
                "audit_log_detail",
                "query",
                [("log_ids", "[Int!]!")],
                "[AuditLogDetail!]!",
                [ROLE, ADMIN_ROLE],
                "Dữ liệu trước/sau của dòng nhật ký kiểm toán, đã che dữ liệu cá nhân (cần audit.read, ADR #43)",
            ),
            _action(
                "lakehouse_datasets",
                "query",
                [],
                "[LakehouseDataset!]!",
                [ROLE, ADMIN_ROLE],
                "Tập dữ liệu tầng silver của tenant (cần data.lakehouse.read, ADR #45)",
                timeout=30,
            ),
            _action(
                "lakehouse_preview",
                "query",
                [("dataset", "String!")],
                "LakehousePreview!",
                [ROLE, ADMIN_ROLE],
                "Số dòng và 20 dòng thay đổi gần nhất của một tập dữ liệu, đã che dữ liệu cá nhân (ADR #45)",
                timeout=60,
            ),
            _action(
                "lineage_refresh",
                "mutation",
                [],
                "LineageRefresh!",
                [ROLE, ADMIN_ROLE],
                "Dựng lại phả hệ dữ liệu từ hệ thống đang chạy và đối chiếu PostgreSQL ↔ Lakehouse cho công ty (ADR #64)",
                timeout=120,
            ),
            _action(
                "lineage_graph",
                "query",
                [],
                "LineageGraph!",
                [ROLE, ADMIN_ROLE],
                "Phả hệ dữ liệu thu tự động kèm kiểm tra chất lượng, lần chạy của công ty (ADR #64)",
            ),
            _action(
                "api_catalog",
                "query",
                [],
                "ApiCatalog!",
                [ROLE, ADMIN_ROLE],
                "Phạm vi và endpoint của cổng dịch vụ API /api/v1 (ADR #64)",
            ),
            _action(
                "api_key_create",
                "mutation",
                [
                    ("name", "String!"),
                    ("scopes", "[String!]!"),
                    ("expires_days", "Int!"),
                    ("allowed_ips", "[String!]"),
                ],
                "ApiKeyCreated!",
                [ROLE, ADMIN_ROLE],
                "Quản trị viên công ty tạo khóa API; khóa chỉ trả về một lần (ADR #64)",
            ),
            _action(
                "api_key_revoke",
                "mutation",
                [("id", "uuid!")],
                "ApiKeyRevoked!",
                [ROLE, ADMIN_ROLE],
                "Quản trị viên công ty thu hồi khóa API, có hiệu lực ngay (ADR #64)",
            ),
            _action(
                "chat_open_direct",
                "mutation",
                [("person_id", "uuid!")],
                "ChatConversationRef!",
                [ROLE, ADMIN_ROLE],
                "Mở (hoặc tạo) cuộc nhắn tin hai người với đồng nghiệp cùng công ty (ADR #65)",
            ),
            _action(
                "chat_create_group",
                "mutation",
                [("title", "String!"), ("member_ids", "[uuid!]!")],
                "ChatConversationRef!",
                [ROLE, ADMIN_ROLE],
                "Lập nhóm nhắn tin, người tạo là chủ nhóm (ADR #65)",
            ),
            _action(
                "chat_update_group",
                "mutation",
                [("conversation_id", "uuid!"), ("title", "String"), ("add_ids", "[uuid!]"), ("remove_ids", "[uuid!]")],
                "ChatGroupUpdated!",
                [ROLE, ADMIN_ROLE],
                "Chủ nhóm đổi tên, thêm hoặc bớt thành viên (ADR #65)",
            ),
            _action(
                "chat_leave",
                "mutation",
                [("conversation_id", "uuid!")],
                "ChatLeft!",
                [ROLE, ADMIN_ROLE],
                "Rời nhóm hoặc cuộc hai người; kênh đơn vị theo phân công, không tự rời được (ADR #65)",
            ),
            _action(
                "calendar_events",
                "query",
                [("from", "String!"), ("to", "String!"), ("view", "String"), ("unit_id", "uuid")],
                "CalendarEvents!",
                [ROLE, ADMIN_ROLE],
                "Các lần diễn ra của lịch công tác người gọi xem được trong khoảng thời gian, kèm hạn công việc dự án (ADR #65)",
            ),
            _action(
                "calendar_save",
                "mutation",
                [("event", "jsonb!")],
                "CalendarSaved!",
                [ROLE, ADMIN_ROLE],
                "Tạo hoặc sửa lịch công tác, mời người tham dự; trả các lịch trùng giờ (ADR #65)",
            ),
            _action(
                "calendar_cancel",
                "mutation",
                [("id", "uuid!")],
                "CalendarCancelled!",
                [ROLE, ADMIN_ROLE],
                "Hủy lịch công tác, báo người được mời (ADR #65)",
            ),
            _action(
                "calendar_respond",
                "mutation",
                [("id", "uuid!"), ("response", "String!")],
                "CalendarResponded!",
                [ROLE, ADMIN_ROLE],
                "Người được mời nhận lời, từ chối hoặc chưa chắc (ADR #65)",
            ),
            *_project_actions(),
            _action(
                "semantic_catalog",
                "query",
                [],
                "SemanticCatalog!",
                [ROLE, ADMIN_ROLE],
                "Danh mục chỉ số, chiều và chu kỳ của lớp ngữ nghĩa trên Lakehouse (cần data.lakehouse.read)",
            ),
            _action(
                "semantic_query",
                "query",
                [
                    ("metric", "String"),
                    ("metrics", "[String!]"),
                    ("dimensions", "[String!]"),
                    ("time_grain", "String"),
                    ("from", "String"),
                    ("to", "String"),
                    ("filters", "jsonb"),
                    ("limit", "Int"),
                ],
                "SemanticResult!",
                [ROLE, ADMIN_ROLE],
                "Truy vấn chỉ số theo chiều bằng tên nghiệp vụ; hệ thống sinh SQL từ danh mục có kiểm soát (cần data.lakehouse.read)",
                timeout=60,
            ),
            _action(
                "submit_kb_document",
                "mutation",
                [("id", "uuid!")],
                "KbActionResult!",
                [ROLE, ADMIN_ROLE],
                "Gửi duyệt đề xuất tài liệu thư viện (người lập, ADR #48)",
            ),
            _action(
                "cancel_kb_document",
                "mutation",
                [("id", "uuid!"), ("reason", "String!")],
                "KbActionResult!",
                [ROLE, ADMIN_ROLE],
                "Người lập hủy đề xuất tài liệu chưa duyệt xong",
            ),
            _action(
                "retire_kb_document",
                "mutation",
                [("id", "uuid!"), ("reason", "String!")],
                "KbActionResult!",
                [ROLE, ADMIN_ROLE],
                "Ngừng hiệu lực tài liệu đang xuất bản (cần kb.document.manage)",
            ),
            _action(
                "kb_reindex",
                "mutation",
                [("id", "uuid!")],
                "KbActionResult!",
                [ROLE, ADMIN_ROLE],
                "Nạp lại chỉ mục tìm kiếm cho tài liệu và tệp của nó (cần kb.document.manage)",
            ),
            _action(
                "kb_library",
                "query",
                [],
                "KbLibrary!",
                [ROLE, ADMIN_ROLE],
                "Thư viện tri thức: tài liệu đang hiệu lực người gọi đọc được, trạng thái chỉ mục, phiên bản trước",
            ),
            _action(
                "ops_dashboard",
                "query",
                [("tab", "String!"), ("days", "Int")],
                "OpsDashboard!",
                [ROLE, ADMIN_ROLE],
                "Số liệu Trung tâm điều hành: process | production | hospital | quality | sites (ADR #49)",
                timeout=60,
            ),
            _action(
                "iot_acknowledge",
                "mutation",
                [("id", "uuid!"), ("note", "String!")],
                "IotAckResult!",
                [ROLE, ADMIN_ROLE],
                "Ghi nhận một sự cố thiết bị của Bản sao số kèm hướng xử lý (ADR #50)",
            ),
            _action(
                "iot_entities",
                "query",
                [("type", "String"), ("id", "String"), ("limit", "Int")],
                "IotEntities!",
                [ROLE, ADMIN_ROLE],
                "Thực thể bản sao số dạng NGSI-LD chuẩn, kèm giá trị đo mới nhất (ADR #74)",
            ),
            _action(
                "iot_ingest",
                "mutation",
                [("entity", "String!"), ("attrs", "jsonb!")],
                "IotIngestResult!",
                [ROLE, ADMIN_ROLE],
                "Ghi số đo NGSI-LD của một thiết bị (cần iot.ingest ở đơn vị của thiết bị, ADR #74)",
            ),
            _action(
                "iot_mqtt_account_create",
                "mutation",
                [("label", "String!")],
                "IotMqttAccount!",
                [ROLE, ADMIN_ROLE],
                "Tạo tài khoản MQTT cho thiết bị / cổng OT, mật khẩu hiện một lần (quản trị viên công ty)",
            ),
            _action(
                "iot_mqtt_account_revoke",
                "mutation",
                [("username", "String!")],
                "IotMqttRevoked!",
                [ROLE, ADMIN_ROLE],
                "Thu hồi tài khoản MQTT, ngắt kết nối ngay (quản trị viên công ty)",
            ),
            _action(
                "process_models",
                "query",
                [],
                "ProcessModelList!",
                [ROLE, ADMIN_ROLE],
                "Thiết kế quy trình: danh sách quy trình BPMN của tenant (ADR #47)",
            ),
            _action(
                "process_model_get",
                "query",
                [("id", "uuid!")],
                "ProcessModelDetail!",
                [ROLE, ADMIN_ROLE],
                "Bản nháp BPMN, biểu mẫu, kết quả kiểm tra, phiên bản phát hành, lần chạy thử",
            ),
            _action(
                "process_model_validate",
                "query",
                [("bpmn_xml", "String!"), ("forms", "jsonb")],
                "[ProcessIssue!]!",
                [ROLE, ADMIN_ROLE],
                "Kiểm tra cú pháp và luật của một bản BPMN",
            ),
            _action(
                "process_model_save",
                "mutation",
                [
                    ("id", "uuid"),
                    ("process_key", "String!"),
                    ("name", "String!"),
                    ("description", "String"),
                    ("bpmn_xml", "String!"),
                    ("forms", "jsonb"),
                    ("owner_unit_id", "uuid"),
                ],
                "ProcessSaveResult!",
                [ROLE, ADMIN_ROLE],
                "Tạo / lưu bản nháp quy trình; người có wf.process.design tại đơn vị sở hữu (trưởng phòng, giám đốc...)",
            ),
            _action(
                "process_from_document",
                "mutation",
                [("document_id", "uuid!"), ("owner_unit_id", "uuid")],
                "ProcessFromDocumentResult!",
                [ROLE, ADMIN_ROLE],
                "Đọc tài liệu đang hiệu lực trong thư viện tri thức theo mẫu quy trình và dựng bản nháp sơ đồ BPMN (ADR #59)",
                timeout=60,
            ),
            _action(
                "process_regulation_draft",
                "mutation",
                [
                    ("id", "uuid!"),
                    ("version", "Int"),
                    ("submit", "Boolean"),
                    ("requester_position_id", "uuid"),
                    ("effective_date", "date"),
                ],
                "ProcessRegulationResult!",
                [ROLE, ADMIN_ROLE],
                "Lập văn bản quy định từ phiên bản đã phát hành, đề xuất vào thư viện tri thức, có thể gửi duyệt luôn (ADR #59)",
                timeout=90,
            ),
            _action(
                "process_model_publish",
                "mutation",
                [("id", "uuid!"), ("note", "String"), ("audience", "String")],
                "ProcessPublishResult!",
                [ROLE, ADMIN_ROLE],
                "Phát hành bản nháp thành phiên bản bất biến và thông báo cho đối tượng UNIT | COMPANY | GROUP",
            ),
            _action(
                "audit_anchors",
                "query",
                [],
                "AuditAnchors!",
                [ROLE, ADMIN_ROLE],
                "Các bản neo chuỗi băm kiểm toán đã ký và công bố ra ngoài CSDL (cần audit.read)",
            ),
            _action(
                "audit_anchor_verify",
                "query",
                [],
                "AnchorVerify!",
                [ROLE, ADMIN_ROLE],
                "Đối chiếu bản neo với chuỗi hiện tại, chữ ký và bản công bố bên ngoài (cần audit.read)",
                timeout=60,
            ),
            _action(
                "audit_anchor_now",
                "mutation",
                [],
                "AnchorNow!",
                [ROLE, ADMIN_ROLE],
                "Neo ngay đầu chuỗi kiểm toán hiện tại (cần audit.read)",
                timeout=60,
            ),
            _action(
                "obs_logs",
                "query",
                [
                    ("service", "String"),
                    ("level", "String"),
                    ("trace_id", "String"),
                    ("q", "String"),
                    ("since_minutes", "Int"),
                    ("limit", "Int"),
                ],
                "ObsLogs!",
                [ROLE, ADMIN_ROLE],
                "Nhật ký hệ thống tập trung của tenant, tra theo dịch vụ, mức, từ khóa hoặc mã truy vết (cần audit.read)",
                timeout=30,
            ),
            _action(
                "backup_runs",
                "query",
                [],
                "[BackupRun!]!",
                [ROLE, ADMIN_ROLE],
                "Lịch sử sao lưu theo lịch và diễn tập khôi phục (cần audit.read)",
            ),
            _action(
                "set_my_locale",
                "mutation",
                [("locale", "String!")],
                "LocaleResult!",
                [ROLE, ADMIN_ROLE],
                "Ghi ngôn ngữ giao diện (vi, en) của người gọi để văn bản in và tin gửi ra ngoài theo đúng ngôn ngữ",
            ),
            _action(
                "notification_prefs",
                "query",
                [],
                "NotificationPrefs!",
                [ROLE, ADMIN_ROLE],
                "Kênh nhận thông báo ngoài ứng dụng của người gọi và các loại thông báo chọn được",
            ),
            _action(
                "save_notification_pref",
                "mutation",
                [("channel", "String!"), ("address", "String!"), ("enabled", "Boolean"), ("kinds", "[String!]")],
                "ChannelResult!",
                [ROLE, ADMIN_ROLE],
                "Bật hoặc đổi kênh nhận thông báo (EMAIL, SMS, WEBHOOK)",
            ),
            _action(
                "delete_notification_pref",
                "mutation",
                [("channel", "String!")],
                "ChannelResult!",
                [ROLE, ADMIN_ROLE],
                "Xóa kênh nhận thông báo",
            ),
            _action(
                "send_test_notification",
                "mutation",
                [("channel", "String!")],
                "QueueRef!",
                [ROLE, ADMIN_ROLE],
                "Gửi thông báo thử qua một kênh đã lưu",
            ),
            _action(
                "my_deliveries",
                "query",
                [],
                "[Delivery!]!",
                [ROLE, ADMIN_ROLE],
                "20 tin gửi ra ngoài ứng dụng gần nhất của người gọi và trạng thái giao",
            ),
            _action(
                "queue_overview",
                "query",
                [],
                "QueueOverview!",
                [ROLE, ADMIN_ROLE],
                "Hàng đợi tin nhắn của tenant: số lượng theo trạng thái, tin lỗi và hàng chết (cần core.org.manage)",
            ),
            _action(
                "queue_retry",
                "mutation",
                [("id", "uuid!")],
                "QueueRef!",
                [ROLE, ADMIN_ROLE],
                "Đưa tin trong hàng chết trở lại hàng đợi (cần core.org.manage)",
            ),
            _action(
                "queue_verify",
                "query",
                [("id", "uuid!")],
                "QueueVerify!",
                [ROLE, ADMIN_ROLE],
                "Xác minh chữ ký biên nhận và mã băm nội dung của một tin đã giao (cần core.org.manage)",
            ),
            _action(
                "process_script_test",
                "mutation",
                [("model_id", "uuid!"), ("script", "String!"), ("variables", "jsonb")],
                "ProcessScriptTest!",
                [ROLE, ADMIN_ROLE],
                "Chạy thử kịch bản của tác vụ tự động với biến mẫu, không đụng dữ liệu (ADR #73, người thiết kế)",
            ),
            _action(
                "process_automation_enable",
                "mutation",
                [("id", "uuid!"), ("events", "[String!]")],
                "ProcessAutomationResult!",
                [ROLE, ADMIN_ROLE],
                "Bật chạy tự động cho phiên bản đã phát hành: hệ thống tự thực hiện tác vụ tự động và hẹn giờ",
                timeout=60,
            ),
            _action(
                "process_automation_disable",
                "mutation",
                [("id", "uuid!")],
                "ProcessAutomationResult!",
                [ROLE, ADMIN_ROLE],
                "Tắt chạy tự động; các lần chạy đang dở bị hủy",
                timeout=60,
            ),
            _action(
                "process_automation_start",
                "mutation",
                [("id", "uuid!"), ("variables", "jsonb")],
                "ProcessAutomationResult!",
                [ROLE, ADMIN_ROLE],
                "Khởi chạy ngay một lần quy trình tự động (người thiết kế hoặc người giám sát)",
                timeout=60,
            ),
            _action(
                "process_automation_webhook",
                "mutation",
                [("id", "uuid!")],
                "ProcessWebhookResult!",
                [ROLE, ADMIN_ROLE],
                "Tạo hoặc đổi mã webhook để hệ thống ngoài khởi chạy quy trình tự động; mã chỉ hiện một lần",
            ),
            _action(
                "process_automation_events",
                "mutation",
                [("id", "uuid!"), ("events", "[String!]!")],
                "ProcessEventsResult!",
                [ROLE, ADMIN_ROLE],
                "Chọn các sự kiện nghiệp vụ tự khởi chạy quy trình tự động",
            ),
            _action(
                "process_change_request_create",
                "mutation",
                [("id", "uuid!"), ("message", "String!")],
                "ProcessChangeRequestResult!",
                [ROLE, ADMIN_ROLE],
                "Người giám sát (wf.process.review) yêu cầu sửa quy trình đã phát hành; báo cho người thiết kế",
            ),
            _action(
                "process_change_request_resolve",
                "mutation",
                [("id", "uuid!"), ("outcome", "String"), ("note", "String")],
                "ProcessChangeRequestResult!",
                [ROLE, ADMIN_ROLE],
                "Người thiết kế đánh dấu đã xử lý hoặc từ chối yêu cầu sửa; báo cho người yêu cầu",
            ),
            _action(
                "process_model_delete",
                "mutation",
                [("id", "uuid!")],
                "ProcessDeleteResult!",
                [ROLE, ADMIN_ROLE],
                "Xóa quy trình chưa từng phát hành (cần wf.process.design)",
            ),
            _action(
                "process_version_get",
                "query",
                [("id", "uuid!"), ("version", "Int!")],
                "ProcessVersionDetail!",
                [ROLE, ADMIN_ROLE],
                "Nội dung BPMN và biểu mẫu của một phiên bản đã phát hành",
            ),
            _action(
                "process_sandbox_run",
                "mutation",
                [("id", "uuid!"), ("variables", "jsonb")],
                "SandboxRunResult!",
                [ROLE, ADMIN_ROLE],
                "Chạy thử bản nháp trên Flowable với khóa sandbox riêng, ghi các bước đã đi qua",
                timeout=120,
            ),
            _action(
                "ledger_overview",
                "query",
                [("limit", "Int")],
                "LedgerOverview!",
                [ROLE, ADMIN_ROLE],
                "Sổ cái: số liệu và bản niêm phong mới nhất của tệp người gọi xem được (ADR #46)",
            ),
            _action(
                "ledger_verify",
                "mutation",
                [("code", "String"), ("version", "Int"), ("sha256", "String"), ("file_name", "String")],
                "LedgerVerifyResult!",
                [ROLE, ADMIN_ROLE],
                "Đối soát tệp với bản niêm phong theo mã hồ sơ (đọc lại tệp trong kho) hoặc theo SHA-256 (ADR #46)",
                timeout=60,
            ),
            _action(
                "ledger_archive",
                "query",
                [("limit", "Int")],
                "LedgerArchive!",
                [ROLE, ADMIN_ROLE],
                "Phòng đọc: hồ sơ lưu trữ (tệp của chứng từ đã kết thúc) và nhật ký truy cập (ADR #46)",
            ),
            _action(
                "ledger_open_archive",
                "mutation",
                [("attachment_id", "uuid!")],
                "LedgerArchiveView!",
                [ROLE, ADMIN_ROLE],
                "Mở hồ sơ ở phòng đọc: ghi nhật ký truy cập, link xem trực tiếp hạn 60 giây (ADR #46)",
            ),
            _action(
                "check_pii",
                "query",
                [("text", "String!")],
                "PiiCheck!",
                [ROLE, ADMIN_ROLE],
                "Phát hiện và che dữ liệu cá nhân trong văn bản trước khi gửi (Presidio, ADR #43)",
                timeout=10,
            ),
            _action(
                "get_upload_url",
                "mutation",
                [
                    ("entity_type", "String!"),
                    ("entity_id", "uuid!"),
                    ("file_name", "String!"),
                    ("content_type", "String!"),
                    ("size_bytes", "Int!"),
                ],
                "AttachmentUpload!",
                [ROLE, ADMIN_ROLE],
                "Cấp link có chữ ký để trình duyệt PUT tệp lên bucket cách ly (ADR #26)",
            ),
            _action(
                "confirm_upload",
                "mutation",
                [("attachment_id", "uuid!")],
                "AttachmentResult!",
                [ROLE, ADMIN_ROLE],
                "Kiểm tra, quét virus và nhận tệp đã tải lên",
                timeout=120,
            ),
            _action(
                "get_download_url",
                "query",
                [("attachment_id", "uuid!")],
                "AttachmentDownload!",
                [ROLE, ADMIN_ROLE],
                "Link tải về có chữ ký (chỉ tệp sạch, người xem được chứng từ)",
            ),
            _action(
                "ocr_retry",
                "mutation",
                [("attachment_id", "uuid!")],
                "AttachmentResult!",
                [ROLE, ADMIN_ROLE],
                "Xếp lại việc OCR tệp đính kèm đã xong, bị bỏ qua hoặc lỗi (ADR #52)",
            ),
            _action(
                "ocr_document",
                "query",
                [("attachment_id", "uuid!")],
                "OcrDocument!",
                [ROLE, ADMIN_ROLE],
                "Chữ OCR của tệp đính kèm, các trường báo giá, hóa đơn rút ra kèm độ tin cậy và gợi ý khớp danh mục (ADR #52)",
                timeout=30,
            ),
            _action(
                "delete_attachment",
                "mutation",
                [("attachment_id", "uuid!")],
                "AttachmentResult!",
                [ROLE, ADMIN_ROLE],
                "Người tải lên xóa tệp (đề nghị chưa có kết quả)",
            ),
            _action(
                "search_documents",
                "query",
                [("query", "String!"), ("kind", "SearchKind"), ("limit", "Int"), ("offset", "Int")],
                "[SearchHit!]!",
                [ROLE, ADMIN_ROLE],
                "Tìm toàn văn đề nghị mua sắm và nội dung tệp đính kèm, chỉ trả chứng từ người gọi xem được (ADR #36)",
                timeout=15,
            ),
            _action(
                "get_purchase_request_pdf",
                "query",
                [("request_id", "uuid!")],
                "PurchaseRequestPdf!",
                [ROLE, ADMIN_ROLE],
                "Phiếu đề nghị mua sắm dạng PDF: link tải về có chữ ký, chỉ người xem được chứng từ (ADR #37)",
                timeout=60,
            ),
            _action(
                "save_onboarding_private",
                "mutation",
                [
                    ("request_id", "uuid!"),
                    ("national_id", "String"),
                    ("bank_account", "String"),
                    ("bank_name", "String"),
                    ("address", "String"),
                ],
                "OnboardingActionResult!",
                [ROLE, ADMIN_ROLE],
                "Ghi CCCD, số tài khoản, địa chỉ của hồ sơ tiếp nhận (mã hóa bằng OpenBao, lưu kèm bản che)",
            ),
            _action(
                "reveal_onboarding_private",
                "mutation",
                [("request_id", "uuid!")],
                "OnboardingPrivate!",
                [ROLE, ADMIN_ROLE],
                "Xem bản rõ dữ liệu nhạy cảm (cần hr.onboarding.private.read; mỗi lần xem ghi nhật ký)",
            ),
            _action(
                "submit_onboarding_request",
                "mutation",
                [("request_id", "uuid!")],
                "OnboardingActionResult!",
                [ROLE, ADMIN_ROLE],
                "Gửi duyệt đề nghị tiếp nhận nhân sự (người lập)",
            ),
            _action(
                "cancel_onboarding_request",
                "mutation",
                [("request_id", "uuid!"), ("reason", "String!")],
                "OnboardingActionResult!",
                [ROLE, ADMIN_ROLE],
                "Người lập hủy đề nghị tiếp nhận chưa duyệt xong",
            ),
            _action(
                "issue_personnel_decision",
                "mutation",
                [
                    ("decision_type", "String!"),
                    ("person_id", "uuid!"),
                    ("source_position_id", "uuid"),
                    ("target_position_id", "uuid"),
                    ("assignment_type", "String"),
                    ("effective_date", "date!"),
                    ("reason", "String!"),
                ],
                "PersonnelDecisionResult!",
                [ROLE, ADMIN_ROLE],
                "Tổng giám đốc / Phó tổng giám đốc (hr.decision.issue) ban hành quyết định bổ nhiệm, điều chuyển, miễn nhiệm",
            ),
            _action(
                "get_personnel_decision_pdf",
                "query",
                [("decision_id", "uuid!")],
                "DecisionPdf!",
                [ROLE, ADMIN_ROLE],
                "Quyết định nhân sự dạng PDF theo thể thức văn bản hành chính (người ban hành, người được quyết định hoặc hr.decision.read)",
                timeout=60,
            ),
            _action(
                "kpi_snapshots",
                "query",
                [("kpi_key", "String!"), ("limit", "Int")],
                "[KpiSnapshotRow!]!",
                [ROLE, ADMIN_ROLE],
                "Số liệu KPI đã đóng băng theo kỳ, kèm kết quả đối chiếu mã băm",
            ),
            _action(
                "get_kpi_report_pdf",
                "query",
                [("month", "String")],
                "KpiReportPdf!",
                [ROLE, ADMIN_ROLE],
                "Báo cáo KPI đã đóng băng dạng PDF (theo tháng YYYY-MM hoặc tổng hợp)",
                timeout=60,
            ),
            _action(
                "personnel_decisions",
                "query",
                [],
                "PersonnelDecisionList!",
                [ROLE, ADMIN_ROLE],
                "Quyết định nhân sự người gọi được xem (người ban hành, người được ra quyết định hoặc hr.decision.read)",
            ),
            _action(
                "personnel_decision_context",
                "query",
                [],
                "PersonnelDecisionContext!",
                [ROLE, ADMIN_ROLE],
                "Người và vị trí để chọn khi lập quyết định nhân sự (cần hr.decision.issue)",
                timeout=30,
            ),
            _action(
                "create_transfer_request",
                "mutation",
                [
                    ("person_id", "uuid!"),
                    ("source_position_id", "uuid!"),
                    ("target_unit_id", "uuid!"),
                    ("effective_date", "date!"),
                    ("reason", "String!"),
                ],
                "TransferActionResult!",
                [ROLE, ADMIN_ROLE],
                "Lập đề nghị điều chuyển nhân sự: nhân viên, trưởng đơn vị hoặc người có quyền hr.transfer.create (ngày chuyển sau ít nhất 14 ngày)",
            ),
            _action(
                "submit_transfer_request",
                "mutation",
                [("request_id", "uuid!")],
                "TransferActionResult!",
                [ROLE, ADMIN_ROLE],
                "Gửi duyệt đề nghị điều chuyển (người lập)",
            ),
            _action(
                "choose_transfer_position",
                "mutation",
                [("request_id", "uuid!"), ("position_id", "uuid!")],
                "TransferActionResult!",
                [ROLE, ADMIN_ROLE],
                "Trưởng đơn vị tiếp nhận chọn vị trí cho người được điều chuyển, trước khi duyệt bước của mình",
            ),
            _action(
                "cancel_transfer_request",
                "mutation",
                [("request_id", "uuid!"), ("reason", "String!")],
                "TransferActionResult!",
                [ROLE, ADMIN_ROLE],
                "Người lập hủy đề nghị điều chuyển chưa duyệt xong",
            ),
            _action(
                "create_transfer_out",
                "mutation",
                [
                    ("person_id", "uuid!"),
                    ("source_position_id", "uuid!"),
                    ("target_tenant_id", "uuid!"),
                    ("target_unit_id", "uuid!"),
                    ("effective_date", "date!"),
                    ("reason", "String!"),
                ],
                "TransferActionResult!",
                [ROLE, ADMIN_ROLE],
                "Lập đề nghị điều chuyển sang tenant khác cùng tập đoàn (tenant nguồn duyệt trước, rồi tenant đích, rồi tập đoàn mẹ)",
            ),
            _action(
                "submit_transfer_out",
                "mutation",
                [("request_id", "uuid!")],
                "TransferActionResult!",
                [ROLE, ADMIN_ROLE],
                "Gửi duyệt đề nghị điều chuyển liên tập đoàn (người lập ở tenant nguồn)",
            ),
            _action(
                "cancel_transfer_out",
                "mutation",
                [("request_id", "uuid!"), ("reason", "String!")],
                "TransferActionResult!",
                [ROLE, ADMIN_ROLE],
                "Người lập hủy đề nghị liên tập đoàn khi còn ở tenant nguồn",
            ),
            _action(
                "choose_transfer_in_position",
                "mutation",
                [("request_id", "uuid!"), ("position_id", "uuid!")],
                "TransferActionResult!",
                [ROLE, ADMIN_ROLE],
                "Trưởng đơn vị tiếp nhận ở tenant đích chọn vị trí cho người được điều chuyển",
            ),
            _action(
                "transfer_tenants",
                "query",
                [],
                "TransferTenants!",
                [ROLE, ADMIN_ROLE],
                "Các tenant khác cùng tập đoàn để điều chuyển đến",
            ),
            _action(
                "transfer_target_units",
                "query",
                [("tenant_id", "uuid!")],
                "TransferUnits!",
                [ROLE, ADMIN_ROLE],
                "Đơn vị của tenant đích (cùng tập đoàn) để chọn nơi tiếp nhận",
            ),
            _action(
                "confirm_ic_order",
                "mutation",
                [("order_id", "uuid!"), ("lots", "[IcOrderLot!]")],
                "IcOrderActionResult!",
                [ROLE, ADMIN_ROLE],
                "Bên bán xác nhận đơn hàng nội bộ kèm lô xuất từng dòng; sinh đơn mua cho bên mua (ADR #42)",
            ),
            _action(
                "reject_ic_order",
                "mutation",
                [("order_id", "uuid!"), ("reason", "String!")],
                "IcOrderActionResult!",
                [ROLE, ADMIN_ROLE],
                "Bên bán từ chối đơn hàng nội bộ (ghi lý do)",
            ),
            _action(
                "cancel_ic_order",
                "mutation",
                [("order_id", "uuid!"), ("reason", "String!")],
                "IcOrderActionResult!",
                [ROLE, ADMIN_ROLE],
                "Người đặt hủy đơn hàng nội bộ còn chờ xác nhận",
            ),
            _action(
                "retry_onboarding_account",
                "mutation",
                [("request_id", "uuid!"), ("username", "String")],
                "OnboardingActionResult!",
                [ROLE, ADMIN_ROLE],
                "Tạo lại tài khoản đăng nhập khi lần trước lỗi (có thể đổi tên đăng nhập)",
            ),
            _action(
                "admin_save",
                "mutation",
                [("entity", "AdminEntity!"), ("data", "jsonb!")],
                "AdminSaveResult!",
                [ROLE, ADMIN_ROLE],
                "Thêm / sửa đơn vị, vị trí, người, bổ nhiệm, vai trò, cấp quyền, danh mục, dữ liệu chủ (ADR #44)",
            ),
            _action(
                "admin_close",
                "mutation",
                [("entity", "AdminEntity!"), ("id", "uuid!"), ("end_date", "date")],
                "AdminSaveResult!",
                [ROLE, ADMIN_ROLE],
                "Ngừng đơn vị / vị trí, kết thúc bổ nhiệm, thu hồi cấp quyền (hết ngày end_date hoặc ngay)",
            ),
            _action(
                "create_person_accounts",
                "mutation",
                [("accounts", "[AdminAccountInput!]!")],
                "[AdminAccountResult!]!",
                [ROLE, ADMIN_ROLE],
                "Tạo hoặc liên kết tài khoản đăng nhập cho người; mật khẩu tạm chỉ trả về một lần",
                timeout=60,
            ),
            _action(
                "delete_person",
                "mutation",
                [("id", "uuid!")],
                "AdminDeleteResult!",
                [ROLE, ADMIN_ROLE],
                "Xóa hẳn người chưa có dữ liệu nghiệp vụ; vô hiệu hóa tài khoản nếu không còn dùng ở tenant khác",
            ),
            _action(
                "admin_import",
                "mutation",
                [
                    ("kind", "AdminEntity!"),
                    ("file_name", "String!"),
                    ("content_base64", "String!"),
                    ("dry_run", "Boolean!"),
                ],
                "AdminImportResult!",
                [ROLE, ADMIN_ROLE],
                "Nhập hàng loạt từ CSV/XLSX: xem trước lỗi từng dòng; chỉ ghi khi mọi dòng hợp lệ",
                timeout=120,
            ),
            _action(
                "adopt_proposed_partner",
                "mutation",
                [("request_id", "uuid!"), ("code", "String")],
                "AdminSaveResult!",
                [ROLE, ADMIN_ROLE],
                "Thêm nhà cung cấp người lập đề nghị gõ tự do vào danh mục (cần mdm.manage)",
            ),
            _action(
                "proposed_partners",
                "query",
                [],
                "[ProposedPartner!]!",
                [ROLE, ADMIN_ROLE],
                "Nhà cung cấp gõ tự do trên đề nghị, chờ thêm vào danh mục (cần mdm.manage)",
            ),
            _action(
                "drive_usage",
                "query",
                [],
                "DriveUsage!",
                [ROLE, ADMIN_ROLE],
                "Dung lượng tệp của tenant: đã dùng, hạn mức, còn lại, theo loại tệp",
            ),
            _action(
                "admin_import_template",
                "query",
                [("kind", "AdminEntity!")],
                "AdminTemplate!",
                [ROLE, ADMIN_ROLE],
                "Tệp mẫu XLSX để nhập hàng loạt",
            ),
            _action(
                "ai_ask",
                "mutation",
                [("agent_id", "uuid!"), ("question", "String!"), ("kb_document_id", "uuid")],
                "AiAskResult!",
                [ROLE, ADMIN_ROLE],
                "Gửi một lượt hỏi Trợ lý RAG; theo dõi câu trả lời qua subscription core_ai_question_by_pk (ADR #51)",
            ),
            _action(
                "ai_assistants",
                "query",
                [],
                "AiAssistants!",
                [ROLE, ADMIN_ROLE],
                "Trợ lý AI đang hoạt động người gọi hỏi được, và AI cục bộ có đang bật không",
            ),
            _action(
                "ai_models",
                "query",
                [],
                "AiModels!",
                [ROLE, ADMIN_ROLE],
                "Mô hình đang có trong Ollama (cần core.ai.manage)",
            ),
            _action(
                "ai_agent_stats",
                "query",
                [("days", "Int")],
                "[AiAgentStats!]!",
                [ROLE, ADMIN_ROLE],
                "Số liệu lượt hỏi theo tác tử AI, không kèm nội dung (cần core.ai.manage)",
            ),
            _action(
                "ai_agent_register",
                "mutation",
                [
                    ("name", "String!"),
                    ("model", "String!"),
                    ("status", "String"),
                    ("guardrail_config", "jsonb"),
                    ("tool_list", "jsonb"),
                ],
                "AiAgent!",
                [ROLE, ADMIN_ROLE],
                "Đăng ký tác tử AI (cần core.ai.manage)",
            ),
            _action(
                "ai_agent_update",
                "mutation",
                [
                    ("id", "uuid!"),
                    ("name", "String"),
                    ("model", "String"),
                    ("status", "String"),
                    ("guardrail_config", "jsonb"),
                    ("tool_list", "jsonb"),
                ],
                "AiAgent!",
                [ROLE, ADMIN_ROLE],
                "Sửa tác tử AI (cần core.ai.manage)",
            ),
            _action(
                "ai_agent_automation",
                "mutation",
                [
                    ("id", "uuid!"),
                    ("triggers", "jsonb!"),
                    ("instructions", "String"),
                    ("allowed_actions", "jsonb!"),
                    ("autonomy", "String"),
                    ("webhook_url", "String"),
                ],
                "AiAgentAutomation!",
                [ROLE, ADMIN_ROLE],
                "Đặt sự kiện kích hoạt, nhiệm vụ, hành động được phép để tác tử tự hành động (ADR #72, cần core.ai.manage)",
            ),
            _action(
                "ai_agent_trigger_options",
                "query",
                [],
                "AiAgentTriggerOptions!",
                [ROLE, ADMIN_ROLE],
                "Danh mục sự kiện, hành động và mức tự chủ cho tác tử tự hành động (cần core.ai.manage)",
            ),
            _action(
                "ai_agent_unregister",
                "mutation",
                [("id", "uuid!")],
                "AiAgentRemoved!",
                [ROLE, ADMIN_ROLE],
                "Xóa tác tử AI chưa có lượt hỏi, hoặc ngừng kích hoạt nếu đã có (cần core.ai.manage)",
            ),
            _action(
                "modules",
                "query",
                [],
                "ModuleOverview!",
                [ROLE, ADMIN_ROLE],
                "Danh mục mô-đun chức năng, đã cài trên máy và đã bật cho công ty chưa (ADR #56)",
                timeout=10,
            ),
            _action(
                "legal_status",
                "query",
                [],
                "LegalStatus!",
                [ROLE, ADMIN_ROLE],
                "Thông tin pháp lý của công ty và lần xác thực chữ ký số gần nhất (ADR #57)",
                timeout=10,
            ),
            _action(
                "legal_application",
                "mutation",
                [],
                "LegalApplication!",
                [ROLE, ADMIN_ROLE],
                "Chủ sở hữu lập đơn xác thực thông tin doanh nghiệp (PDF) để ký số",
                timeout=90,
            ),
            _action(
                "legal_verify",
                "mutation",
                [("application_id", "uuid!"), ("content_base64", "String!")],
                "LegalStatus!",
                [ROLE, ADMIN_ROLE],
                "Chủ sở hữu tải lên đơn đã ký số; hợp lệ thì công ty được xác thực pháp lý",
                timeout=60,
            ),
            _action(
                "ext_register",
                "mutation",
                [("manifest", "jsonb!")],
                "ExtRegistered!",
                [ROLE, ADMIN_ROLE],
                "Đăng ký hoặc cập nhật mô-đun ngoài theo manifest; trả khóa mô-đun một lần (ADR #58)",
            ),
            _action(
                "ext_rotate_key",
                "mutation",
                [("code", "String!")],
                "ExtRegistered!",
                [ROLE, ADMIN_ROLE],
                "Đổi khóa của mô-đun ngoài; khóa cũ hết hiệu lực ngay",
                timeout=10,
            ),
            _action(
                "ext_launch",
                "mutation",
                [("code", "String!"), ("path", "String")],
                "ExtLaunch!",
                [ROLE, ADMIN_ROLE],
                "Cấp phiên 8 giờ để mở giao diện mô-đun ngoài trong khung nhúng",
                timeout=10,
            ),
            _action(
                "transfer_ownership",
                "mutation",
                [("person_id", "uuid!")],
                "OwnershipTransfer!",
                [ROLE, ADMIN_ROLE],
                "Chủ sở hữu chuyển quyền chủ sở hữu cho người khác trong công ty (ADR #57)",
                timeout=10,
            ),
            _action(
                "create_subsidiary",
                "mutation",
                [
                    ("code", "String!"),
                    ("name", "String!"),
                    ("root_type", "String"),
                    ("tax_code", "String"),
                    ("legal_name", "String"),
                    ("address", "String"),
                    ("legal_rep_name", "String"),
                    ("owner", "SubsidiaryOwnerInput!"),
                ],
                "SubsidiaryResult!",
                [ROLE, ADMIN_ROLE],
                "Chủ sở hữu tạo công ty thành viên trực thuộc, kèm chủ sở hữu của công ty đó",
            ),
            *[
                _action(name, "mutation", [("code", "String!")], "ModuleOverview!", [ROLE, ADMIN_ROLE], comment)
                for name, comment in (
                    ("module_enable", "Bật mô-đun cho công ty, kèm các mô-đun nó phụ thuộc (cần core.module.manage)"),
                    ("module_disable", "Tắt mô-đun của công ty; bị chặn khi còn mô-đun dựa vào nó hoặc chứng từ dở"),
                    ("module_install", "Cài mô-đun trên máy, chạy container của nó (chỉ platform_admin)"),
                    (
                        "module_uninstall",
                        "Gỡ mô-đun khỏi máy, dừng container (chỉ platform_admin, không công ty nào bật)",
                    ),
                )
            ],
        ],
        "custom_types": {
            "input_objects": [
                {
                    "name": "SubsidiaryOwnerInput",
                    "fields": [
                        {"name": "username", "type": "String!"},
                        {"name": "full_name", "type": "String!"},
                        {"name": "email", "type": "String"},
                    ],
                },
                {
                    "name": "IcOrderLot",
                    "fields": [{"name": "line_id", "type": "uuid!"}, {"name": "lot_id", "type": "uuid!"}],
                },
                {
                    "name": "AdminAccountInput",
                    "fields": [
                        {"name": "person_id", "type": "uuid!"},
                        {"name": "username", "type": "String!"},
                        {"name": "email", "type": "String"},
                        {"name": "link_existing", "type": "Boolean"},
                    ],
                },
            ],
            "enums": [
                {
                    "name": "ApprovalDecision",
                    "values": [{"value": "APPROVE"}, {"value": "REJECT"}, {"value": "RETURN"}],
                },
                {
                    "name": "SearchKind",
                    "values": [{"value": "purchase_request"}, {"value": "attachment"}, {"value": "kb_document"}],
                },
                {
                    "name": "AdminEntity",
                    "values": [
                        {"value": v}
                        for v in (
                            "org_unit",
                            "position",
                            "person",
                            "assignment",
                            "role",
                            "role_grant",
                            "catalog_item",
                            "partner",
                            "item",
                            "storage_quota",
                        )
                    ],
                },
            ],
            "objects": [
                {
                    "name": "OwnershipTransfer",
                    "fields": [{"name": "owner_id", "type": "uuid!"}, {"name": "owner_name", "type": "String!"}],
                },
                {
                    "name": "SubsidiaryResult",
                    "fields": [
                        {"name": "tenant_code", "type": "String!"},
                        {"name": "tenant_name", "type": "String!"},
                        {"name": "username", "type": "String!"},
                        {"name": "password", "type": "String"},
                    ],
                },
                {
                    "name": "LegalVerification",
                    "fields": [
                        {"name": "signer_name", "type": "String"},
                        {"name": "signer_subject", "type": "String!"},
                        {"name": "issuer", "type": "String!"},
                        {"name": "signed_at", "type": "timestamptz"},
                        {"name": "verified_at", "type": "timestamptz!"},
                    ],
                },
                {
                    "name": "LegalStatus",
                    "fields": [
                        {"name": "tax_code", "type": "String"},
                        {"name": "legal_name", "type": "String"},
                        {"name": "legal_rep_name", "type": "String"},
                        {"name": "legal_status", "type": "String"},
                        {"name": "is_owner", "type": "Boolean!"},
                        {"name": "has_owner", "type": "Boolean!"},
                        {"name": "signature_ready", "type": "Boolean!"},
                        {"name": "verification", "type": "LegalVerification"},
                    ],
                },
                {
                    "name": "LegalApplication",
                    "fields": [
                        {"name": "application_id", "type": "uuid!"},
                        {"name": "nonce", "type": "String!"},
                        {"name": "expires_at", "type": "timestamptz!"},
                        {"name": "pdf_base64", "type": "String!"},
                        {"name": "file_name", "type": "String!"},
                    ],
                },
                {
                    "name": "ModuleService",
                    "fields": [{"name": "name", "type": "String!"}, {"name": "running", "type": "Boolean"}],
                },
                {
                    "name": "ModuleMenu",
                    "fields": [{"name": "label", "type": "String!"}, {"name": "path", "type": "String!"}],
                },
                {
                    "name": "ExtRegistered",
                    "fields": [
                        {"name": "code", "type": "String!"},
                        {"name": "api_key", "type": "String"},
                        {"name": "reachable", "type": "Boolean!"},
                        {"name": "message", "type": "String!"},
                        {"name": "updated", "type": "Boolean!"},
                    ],
                },
                {
                    "name": "ExtLaunch",
                    "fields": [{"name": "path", "type": "String!"}, {"name": "name", "type": "String!"}],
                },
                {
                    "name": "ModuleInfo",
                    "fields": [
                        {"name": "code", "type": "String!"},
                        {"name": "name", "type": "String!"},
                        {"name": "description", "type": "String!"},
                        {"name": "depends", "type": "[String!]!"},
                        {"name": "dependents", "type": "[String!]!"},
                        {"name": "services", "type": "[ModuleService!]!"},
                        {"name": "installed", "type": "Boolean!"},
                        {"name": "enabled", "type": "Boolean!"},
                        {"name": "external", "type": "Boolean!"},
                        {"name": "vendor", "type": "String"},
                        {"name": "version", "type": "String"},
                        {"name": "scopes", "type": "[String!]!"},
                        {"name": "menu", "type": "[ModuleMenu!]!"},
                    ],
                },
                {
                    "name": "ModuleOverview",
                    "fields": [
                        {"name": "can_manage", "type": "Boolean!"},
                        {"name": "can_install", "type": "Boolean!"},
                        {"name": "modules", "type": "[ModuleInfo!]!"},
                        {"name": "changed", "type": "[String!]!"},
                    ],
                },
                {
                    "name": "AccountTenant",
                    "fields": [
                        {"name": "tenant_id", "type": "uuid!"},
                        {"name": "tenant_code", "type": "String!"},
                        {"name": "tenant_name", "type": "String!"},
                        {"name": "person_id", "type": "uuid!"},
                        {"name": "full_name", "type": "String!"},
                    ],
                },
                {
                    "name": "PurchaseRequestActionResult",
                    "fields": [{"name": "request_id", "type": "uuid!"}, {"name": "status", "type": "String!"}],
                    "relationships": [
                        {
                            "name": "purchase_request",
                            "type": "object",
                            "source": "bms",
                            "remote_table": {"schema": "proc", "name": "purchase_request"},
                            "field_mapping": {"request_id": "id"},
                        }
                    ],
                },
                {
                    "name": "ProcessState",
                    "fields": [
                        {"name": "request_id", "type": "uuid!"},
                        {"name": "round", "type": "Int!"},
                        {"name": "status", "type": "String!"},
                        {"name": "process_instance_id", "type": "String"},
                        {"name": "bpmn_xml", "type": "String!"},
                        {"name": "active_activity_ids", "type": "[String!]!"},
                        {"name": "completed_activity_ids", "type": "[String!]!"},
                        {"name": "source", "type": "String!"},
                    ],
                },
                {
                    "name": "AttachmentUpload",
                    "fields": [
                        {"name": "attachment_id", "type": "uuid!"},
                        {"name": "upload_url", "type": "String!"},
                        {"name": "method", "type": "String!"},
                        {"name": "content_type", "type": "String!"},
                        {"name": "expires_in", "type": "Int!"},
                    ],
                    "relationships": [_attachment_rel()],
                },
                {
                    "name": "AttachmentResult",
                    "fields": [
                        {"name": "attachment_id", "type": "uuid!"},
                        {"name": "status", "type": "String!"},
                        {"name": "scan_result", "type": "String"},
                    ],
                    "relationships": [_attachment_rel()],
                },
                {
                    "name": "ProposedPartner",
                    "fields": [
                        {"name": "request_id", "type": "uuid!"},
                        {"name": "doc_no", "type": "String!"},
                        {"name": "title", "type": "String!"},
                        {"name": "status", "type": "String!"},
                        {"name": "name", "type": "String!"},
                        {"name": "tax_code", "type": "String"},
                        {"name": "requester", "type": "String!"},
                        {"name": "created_on", "type": "String!"},
                    ],
                },
                {
                    "name": "DriveUsageType",
                    "fields": [
                        {"name": "content_type", "type": "String!"},
                        {"name": "bytes", "type": "bigint!"},
                        {"name": "files", "type": "Int!"},
                    ],
                },
                {
                    "name": "DriveUsage",
                    "fields": [
                        {"name": "quota_bytes", "type": "bigint!"},
                        {"name": "used_bytes", "type": "bigint!"},
                        {"name": "available_bytes", "type": "bigint!"},
                        {"name": "by_type", "type": "[DriveUsageType!]!"},
                    ],
                },
                {
                    "name": "AttachmentDownload",
                    "fields": [
                        {"name": "attachment_id", "type": "uuid!"},
                        {"name": "url", "type": "String!"},
                        {"name": "expires_in", "type": "Int!"},
                    ],
                },
                {
                    "name": "SearchHit",
                    "fields": [
                        {"name": "kind", "type": "SearchKind!"},
                        {"name": "entity_type", "type": "String!"},
                        {"name": "entity_id", "type": "uuid!"},
                        {"name": "attachment_id", "type": "uuid"},
                        {"name": "file_name", "type": "String"},
                        {"name": "matched_field", "type": "String"},
                        {"name": "snippet", "type": "String!"},
                        {"name": "score", "type": "Float!"},
                    ],
                    "relationships": [
                        {
                            "name": "purchase_request",
                            "type": "object",
                            "source": "bms",
                            "remote_table": {"schema": "proc", "name": "purchase_request"},
                            "field_mapping": {"entity_id": "id"},
                        },
                        {
                            "name": "kb_document",
                            "type": "object",
                            "source": "bms",
                            "remote_table": {"schema": "collab", "name": "kb_document"},
                            "field_mapping": {"entity_id": "id"},
                        },
                        _attachment_rel(),
                    ],
                },
                {
                    "name": "DecisionPdf",
                    "fields": [
                        {"name": "decision_id", "type": "uuid!"},
                        {"name": "doc_no", "type": "String!"},
                        {"name": "url", "type": "String!"},
                        {"name": "file_name", "type": "String!"},
                        {"name": "check_code", "type": "String!"},
                        {"name": "cached", "type": "Boolean!"},
                        {"name": "expires_in", "type": "Int!"},
                    ],
                },
                {
                    "name": "KpiReportPdf",
                    "fields": [
                        {"name": "month", "type": "String"},
                        {"name": "kpis", "type": "Int!"},
                        {"name": "url", "type": "String!"},
                        {"name": "file_name", "type": "String!"},
                        {"name": "check_code", "type": "String!"},
                        {"name": "cached", "type": "Boolean!"},
                        {"name": "expires_in", "type": "Int!"},
                    ],
                },
                {
                    "name": "KpiSnapshotRow",
                    "fields": [
                        {"name": "kpi_key", "type": "String!"},
                        {"name": "label", "type": "String!"},
                        {"name": "unit", "type": "String!"},
                        {"name": "grain", "type": "String!"},
                        {"name": "period", "type": "String!"},
                        {"name": "value", "type": "Float!"},
                        {"name": "sha256", "type": "String!"},
                        {"name": "frozen_at", "type": "String!"},
                        {"name": "valid", "type": "Boolean!"},
                    ],
                },
                {
                    "name": "PurchaseRequestPdf",
                    "fields": [
                        {"name": "request_id", "type": "uuid!"},
                        {"name": "url", "type": "String!"},
                        {"name": "file_name", "type": "String!"},
                        {"name": "check_code", "type": "String!"},
                        {"name": "status", "type": "String!"},
                        {"name": "cached", "type": "Boolean!"},
                        {"name": "expires_in", "type": "Int!"},
                    ],
                },
                {
                    "name": "OnboardingActionResult",
                    "fields": [
                        {"name": "request_id", "type": "uuid!"},
                        {"name": "status", "type": "String!"},
                        {"name": "account_status", "type": "String!"},
                    ],
                    "relationships": [
                        {
                            "name": "onboarding_request",
                            "type": "object",
                            "source": "bms",
                            "remote_table": {"schema": "hr", "name": "onboarding_request"},
                            "field_mapping": {"request_id": "id"},
                        }
                    ],
                },
                {
                    "name": "TransferActionResult",
                    "fields": [
                        {"name": "request_id", "type": "uuid!"},
                        {"name": "status", "type": "String!"},
                    ],
                    "relationships": [
                        {
                            "name": "transfer_request",
                            "type": "object",
                            "source": "bms",
                            "remote_table": {"schema": "hr", "name": "transfer_request"},
                            "field_mapping": {"request_id": "id"},
                        }
                    ],
                },
                {
                    "name": "PersonnelDecisionResult",
                    "fields": [{"name": "id", "type": "uuid!"}, {"name": "doc_no", "type": "String!"}],
                },
                {
                    "name": "PersonnelDecisionList",
                    "fields": [{"name": "can_issue", "type": "Boolean!"}, {"name": "decisions", "type": "json!"}],
                },
                {
                    "name": "PersonnelDecisionContext",
                    "fields": [{"name": "people", "type": "json!"}, {"name": "positions", "type": "json!"}],
                },
                {
                    "name": "TransferTenants",
                    "fields": [{"name": "tenants", "type": "json!"}],
                },
                {
                    "name": "TransferUnits",
                    "fields": [{"name": "units", "type": "json!"}],
                },
                {
                    "name": "IcOrderActionResult",
                    "fields": [
                        {"name": "order_id", "type": "uuid!"},
                        {"name": "status", "type": "String!"},
                        {"name": "purchase_order_id", "type": "uuid"},
                    ],
                    "relationships": [
                        {
                            "name": "ic_order",
                            "type": "object",
                            "source": "bms",
                            "remote_table": {"schema": "ic", "name": "ic_order"},
                            "field_mapping": {"order_id": "id"},
                        },
                        {
                            "name": "purchase_order",
                            "type": "object",
                            "source": "bms",
                            "remote_table": {"schema": "proc", "name": "purchase_order"},
                            "field_mapping": {"purchase_order_id": "id"},
                        },
                    ],
                },
                {
                    "name": "OnboardingPrivate",
                    "fields": [
                        {"name": "request_id", "type": "uuid!"},
                        {"name": "national_id", "type": "String"},
                        {"name": "bank_account", "type": "String"},
                        {"name": "address", "type": "String"},
                        {"name": "username", "type": "String"},
                        {"name": "initial_password", "type": "String"},
                    ],
                },
                {
                    "name": "AuditLogDetail",
                    "fields": [
                        {"name": "log_id", "type": "Int!"},
                        {"name": "table_name", "type": "String!"},
                        {"name": "old_data", "type": "jsonb"},
                        {"name": "new_data", "type": "jsonb"},
                        {"name": "masked", "type": "[String!]!"},
                    ],
                },
                {
                    "name": "LakehouseColumn",
                    "fields": [{"name": "name", "type": "String!"}, {"name": "type", "type": "String!"}],
                },
                {
                    "name": "LakehouseDataset",
                    "fields": [
                        {"name": "name", "type": "String!"},
                        {"name": "label", "type": "String!"},
                        {"name": "domain", "type": "String!"},
                        {"name": "columns", "type": "[LakehouseColumn!]!"},
                    ],
                },
                {
                    "name": "LineageRefresh",
                    "fields": [
                        {"name": "nodes", "type": "Int!"},
                        {"name": "edges", "type": "Int!"},
                        {"name": "checks", "type": "Int!"},
                        {"name": "failed", "type": "Int!"},
                        {"name": "note", "type": "String"},
                    ],
                },
                {
                    "name": "LineageGraph",
                    "fields": [
                        {"name": "nodes", "type": "[jsonb!]!"},
                        {"name": "edges", "type": "[jsonb!]!"},
                        {"name": "checks", "type": "[jsonb!]!"},
                        {"name": "runs", "type": "[jsonb!]!"},
                    ],
                },
                {
                    "name": "ApiCatalog",
                    "fields": [
                        {"name": "scopes", "type": "[jsonb!]!"},
                        {"name": "endpoints", "type": "[jsonb!]!"},
                    ],
                },
                {
                    "name": "ApiKeyCreated",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "key", "type": "String!"},
                        {"name": "prefix", "type": "String!"},
                        {"name": "expires_at", "type": "String!"},
                    ],
                },
                {
                    "name": "ApiKeyRevoked",
                    "fields": [{"name": "id", "type": "uuid!"}, {"name": "revoked", "type": "Boolean!"}],
                },
                {
                    "name": "ChatConversationRef",
                    "fields": [{"name": "conversation_id", "type": "uuid!"}, {"name": "created", "type": "Boolean!"}],
                },
                {
                    "name": "ChatGroupUpdated",
                    "fields": [
                        {"name": "conversation_id", "type": "uuid!"},
                        {"name": "added", "type": "Int!"},
                        {"name": "removed", "type": "Int!"},
                        {"name": "members", "type": "Int!"},
                    ],
                },
                {
                    "name": "ChatLeft",
                    "fields": [{"name": "conversation_id", "type": "uuid!"}, {"name": "left", "type": "Boolean!"}],
                },
                {
                    "name": "CalendarEvents",
                    "fields": [
                        {"name": "events", "type": "[jsonb!]!"},
                        {"name": "from", "type": "String!"},
                        {"name": "to", "type": "String!"},
                    ],
                },
                {
                    "name": "CalendarSaved",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "created", "type": "Boolean!"},
                        {"name": "invited", "type": "Int!"},
                        {"name": "conflicts", "type": "[jsonb!]!"},
                    ],
                },
                {
                    "name": "CalendarCancelled",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "cancelled", "type": "Boolean!"},
                        {"name": "notified", "type": "Int!"},
                    ],
                },
                {
                    "name": "CalendarResponded",
                    "fields": [{"name": "id", "type": "uuid!"}, {"name": "response", "type": "String!"}],
                },
                *PROJECT_TYPES,
                {
                    "name": "SemanticCatalog",
                    "fields": [
                        {"name": "sources", "type": "[jsonb!]!"},
                        {"name": "grains", "type": "[jsonb!]!"},
                    ],
                },
                {
                    "name": "SemanticResult",
                    "fields": [
                        {"name": "source", "type": "String!"},
                        {"name": "measure", "type": "String!"},
                        {"name": "label", "type": "String!"},
                        {"name": "unit", "type": "String!"},
                        {"name": "measures", "type": "[jsonb!]!"},
                        {"name": "columns", "type": "[String!]!"},
                        {"name": "rows", "type": "[jsonb!]!"},
                        {"name": "sql", "type": "String!"},
                    ],
                },
                {
                    "name": "OcrDocument",
                    "fields": [
                        {"name": "attachment_id", "type": "uuid!"},
                        {"name": "file_name", "type": "String!"},
                        {"name": "scan_status", "type": "String!"},
                        {"name": "phase", "type": "String!"},
                        {"name": "message", "type": "String"},
                        {"name": "ocr", "type": "jsonb"},
                        {"name": "text", "type": "String"},
                        {"name": "parsed", "type": "jsonb"},
                        {"name": "partner", "type": "jsonb"},
                        {"name": "item_matches", "type": "jsonb"},
                        {"name": "doc_label", "type": "String"},
                    ],
                },
                {
                    "name": "LakehousePreview",
                    "fields": [
                        {"name": "name", "type": "String!"},
                        {"name": "label", "type": "String!"},
                        {"name": "domain", "type": "String!"},
                        {"name": "columns", "type": "[LakehouseColumn!]!"},
                        {"name": "total_rows", "type": "Int!"},
                        {"name": "rows", "type": "[jsonb!]!"},
                        {"name": "masked", "type": "[String!]!"},
                    ],
                },
                {
                    "name": "OpsDashboard",
                    "fields": [
                        {"name": "tab", "type": "String!"},
                        {"name": "days", "type": "Int!"},
                        {"name": "sla_hours", "type": "Int!"},
                        {"name": "data", "type": "jsonb!"},
                    ],
                },
                {
                    "name": "KbActionResult",
                    "fields": [{"name": "id", "type": "uuid!"}, {"name": "status", "type": "String!"}],
                },
                {
                    "name": "KbDocument",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "doc_no", "type": "String!"},
                        {"name": "title", "type": "String!"},
                        {"name": "category", "type": "String!"},
                        {"name": "scope", "type": "String!"},
                        {"name": "summary", "type": "String"},
                        {"name": "toc", "type": "[String!]!"},
                        {"name": "version", "type": "Int!"},
                        {"name": "supersedes_id", "type": "uuid"},
                        {"name": "effective_date", "type": "String"},
                        {"name": "published_at", "type": "String"},
                        {"name": "unit", "type": "String!"},
                        {"name": "issuer", "type": "String!"},
                        {"name": "requester", "type": "String!"},
                        {"name": "my_company", "type": "Boolean"},
                        {"name": "index_status", "type": "String!"},
                        {"name": "indexed_at", "type": "String"},
                        {"name": "index_error", "type": "String"},
                        {"name": "can_manage", "type": "Boolean!"},
                        {"name": "files", "type": "jsonb!"},
                        {"name": "previous", "type": "jsonb!"},
                    ],
                },
                {
                    "name": "KbLibrary",
                    "fields": [
                        {"name": "can_propose", "type": "Boolean!"},
                        {"name": "documents", "type": "[KbDocument!]!"},
                    ],
                },
                {"name": "IotEntities", "fields": [{"name": "entities", "type": "jsonb!"}]},
                {
                    "name": "IotIngestResult",
                    "fields": [{"name": "entity", "type": "String!"}, {"name": "written", "type": "Int!"}],
                },
                {
                    "name": "IotMqttAccount",
                    "fields": [
                        {"name": "username", "type": "String!"},
                        {"name": "password", "type": "String!"},
                        {"name": "topic", "type": "String!"},
                        {"name": "message", "type": "String!"},
                    ],
                },
                {
                    "name": "IotMqttRevoked",
                    "fields": [{"name": "username", "type": "String!"}, {"name": "revoked", "type": "Boolean!"}],
                },
                {
                    "name": "IotAckResult",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "acknowledged_at", "type": "String!"},
                    ],
                },
                {
                    "name": "ProcessIssue",
                    "fields": [
                        {"name": "level", "type": "String!"},
                        {"name": "message", "type": "String!"},
                        {"name": "element_id", "type": "String"},
                    ],
                },
                {
                    "name": "ProcessModelSummary",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "process_key", "type": "String!"},
                        {"name": "name", "type": "String!"},
                        {"name": "description", "type": "String"},
                        {"name": "owner_unit_id", "type": "uuid"},
                        {"name": "owner_unit", "type": "String"},
                        {"name": "audience", "type": "String"},
                        {"name": "access", "type": "String!"},
                        {"name": "updated_at", "type": "String!"},
                        {"name": "published_version", "type": "Int"},
                        {"name": "last_run_status", "type": "String"},
                        {"name": "runs", "type": "Int!"},
                    ],
                },
                {
                    "name": "ProcessModelList",
                    "fields": [
                        {"name": "can_design", "type": "Boolean!"},
                        {"name": "design_units", "type": "json!"},
                        {"name": "models", "type": "[ProcessModelSummary!]!"},
                    ],
                },
                {
                    "name": "ProcessVersion",
                    "fields": [
                        {"name": "version", "type": "Int!"},
                        {"name": "sha256", "type": "String!"},
                        {"name": "note", "type": "String"},
                        {"name": "audience", "type": "String"},
                        {"name": "published_by", "type": "String!"},
                        {"name": "published_at", "type": "String!"},
                    ],
                },
                {
                    "name": "SandboxRun",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "status", "type": "String!"},
                        {"name": "steps", "type": "jsonb!"},
                        {"name": "variables", "type": "jsonb"},
                        {"name": "error", "type": "String"},
                        {"name": "version", "type": "Int"},
                        {"name": "started_by", "type": "String"},
                        {"name": "started_at", "type": "String"},
                    ],
                },
                {
                    "name": "ProcessModelDetail",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "process_key", "type": "String!"},
                        {"name": "name", "type": "String!"},
                        {"name": "description", "type": "String"},
                        {"name": "access", "type": "String!"},
                        {"name": "owner_unit", "type": "String"},
                        {"name": "audience", "type": "String"},
                        {"name": "viewing_version", "type": "Int"},
                        {"name": "bpmn_xml", "type": "String!"},
                        {"name": "forms", "type": "jsonb!"},
                        {"name": "issues", "type": "[ProcessIssue!]!"},
                        {"name": "versions", "type": "[ProcessVersion!]!"},
                        {"name": "runs", "type": "[SandboxRun!]!"},
                        {"name": "change_requests", "type": "json!"},
                        {"name": "automation", "type": "json"},
                        {"name": "regulations", "type": "json!"},
                    ],
                },
                {
                    "name": "ProcessFromDocumentResult",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "name", "type": "String!"},
                        {"name": "process_key", "type": "String!"},
                        {"name": "steps", "type": "Int!"},
                        {"name": "source", "type": "String!"},
                        {"name": "issues", "type": "[ProcessIssue!]!"},
                        {"name": "warnings", "type": "[String!]!"},
                    ],
                },
                {
                    "name": "ProcessRegulationResult",
                    "fields": [
                        {"name": "document_id", "type": "uuid!"},
                        {"name": "doc_no", "type": "String!"},
                        {"name": "status", "type": "String!"},
                        {"name": "version", "type": "Int!"},
                        {"name": "files", "type": "[String!]!"},
                        {"name": "submitted", "type": "Boolean!"},
                        {"name": "message", "type": "String"},
                    ],
                },
                {
                    "name": "ProcessSaveResult",
                    "fields": [{"name": "id", "type": "uuid!"}, {"name": "issues", "type": "[ProcessIssue!]!"}],
                },
                {
                    "name": "ProcessPublishResult",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "version", "type": "Int!"},
                        {"name": "sha256", "type": "String!"},
                        {"name": "audience", "type": "String!"},
                        {"name": "notified", "type": "Int!"},
                    ],
                },
                {"name": "ProcessChangeRequestResult", "fields": [{"name": "id", "type": "uuid!"}]},
                {
                    "name": "NotificationPrefs",
                    "fields": [{"name": "channels", "type": "json!"}, {"name": "kinds", "type": "json!"}],
                },
                {"name": "ChannelResult", "fields": [{"name": "channel", "type": "String!"}]},
                {"name": "LocaleResult", "fields": [{"name": "locale", "type": "String!"}]},
                {
                    "name": "AuditAnchors",
                    "fields": [{"name": "head_seq", "type": "Int!"}, {"name": "anchors", "type": "json!"}],
                },
                {
                    "name": "AnchorVerify",
                    "fields": [
                        {"name": "ok", "type": "Boolean!"},
                        {"name": "checked", "type": "Int!"},
                        {"name": "problems", "type": "json!"},
                    ],
                },
                {
                    "name": "AnchorNow",
                    "fields": [{"name": "anchored", "type": "Boolean!"}, {"name": "seq", "type": "Int"}],
                },
                {
                    "name": "ObsLogs",
                    "fields": [{"name": "events", "type": "json!"}, {"name": "last_hour", "type": "json!"}],
                },
                {
                    "name": "BackupRun",
                    "fields": [
                        {"name": "id", "type": "Int!"},
                        {"name": "kind", "type": "String!"},
                        {"name": "status", "type": "String!"},
                        {"name": "location", "type": "String"},
                        {"name": "size_bytes", "type": "Int"},
                        {"name": "detail", "type": "json!"},
                        {"name": "started_at", "type": "String!"},
                        {"name": "finished_at", "type": "String!"},
                    ],
                },
                {
                    "name": "QueueRef",
                    "fields": [{"name": "id", "type": "uuid!"}, {"name": "status", "type": "String!"}],
                },
                {
                    "name": "Delivery",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "channel", "type": "String!"},
                        {"name": "status", "type": "String!"},
                        {"name": "attempts", "type": "Int!"},
                        {"name": "last_error", "type": "String"},
                        {"name": "title", "type": "String"},
                        {"name": "address", "type": "String"},
                        {"name": "created_at", "type": "String"},
                        {"name": "delivered_at", "type": "String"},
                    ],
                },
                {
                    "name": "QueueOverview",
                    "fields": [{"name": "counts", "type": "json!"}, {"name": "messages", "type": "json!"}],
                },
                {
                    "name": "QueueVerify",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "valid", "type": "Boolean!"},
                        {"name": "reason", "type": "String"},
                        {"name": "alg", "type": "String"},
                        {"name": "delivered_at", "type": "String"},
                        {"name": "payload_sha256", "type": "String"},
                    ],
                },
                {
                    "name": "ProcessAutomationResult",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "status", "type": "String!"},
                        {"name": "version", "type": "Int!"},
                    ],
                },
                {
                    "name": "ProcessWebhookResult",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "token", "type": "String!"},
                        {"name": "path", "type": "String!"},
                    ],
                },
                {
                    "name": "ProcessEventsResult",
                    "fields": [{"name": "id", "type": "uuid!"}, {"name": "events", "type": "[String!]!"}],
                },
                {"name": "ProcessDeleteResult", "fields": [{"name": "id", "type": "uuid!"}]},
                {
                    "name": "ProcessVersionDetail",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "version", "type": "Int!"},
                        {"name": "bpmn_xml", "type": "String!"},
                        {"name": "forms", "type": "jsonb!"},
                    ],
                },
                {
                    "name": "SandboxRunResult",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "status", "type": "String!"},
                        {"name": "error", "type": "String"},
                        {"name": "steps", "type": "jsonb!"},
                    ],
                },
                {
                    "name": "LedgerSeal",
                    "fields": [
                        {"name": "attachment_id", "type": "uuid!"},
                        {"name": "entity_type", "type": "String!"},
                        {"name": "entity_id", "type": "uuid!"},
                        {"name": "code", "type": "String!"},
                        {"name": "version", "type": "Int!"},
                        {"name": "title", "type": "String!"},
                        {"name": "file_name", "type": "String!"},
                        {"name": "unit", "type": "String!"},
                        {"name": "sealed_at", "type": "String!"},
                        {"name": "channel", "type": "String!"},
                        {"name": "block", "type": "Int"},
                        {"name": "tx_id", "type": "String"},
                        {"name": "sha256", "type": "String!"},
                        {"name": "last_result", "type": "String"},
                        {"name": "last_checked_at", "type": "String"},
                    ],
                },
                {
                    "name": "LedgerOverview",
                    "fields": [
                        {"name": "channel", "type": "String!"},
                        {"name": "sealed", "type": "Int!"},
                        {"name": "sealed_this_week", "type": "Int!"},
                        {"name": "archived", "type": "Int!"},
                        {"name": "checked_today", "type": "Int!"},
                        {"name": "matched_today", "type": "Int!"},
                        {"name": "mismatched_today", "type": "Int!"},
                        {"name": "mismatch_30d", "type": "Int!"},
                        {"name": "chain_reader", "type": "Boolean!"},
                        {"name": "recent", "type": "[LedgerSeal!]!"},
                    ],
                },
                {
                    "name": "LedgerVerifyResult",
                    "fields": [
                        {"name": "kind", "type": "String!"},
                        {"name": "via", "type": "String!"},
                        {"name": "query", "type": "String!"},
                        {"name": "file_name", "type": "String"},
                        {"name": "checked_at", "type": "String!"},
                        {"name": "actual_sha256", "type": "String"},
                        {"name": "problem", "type": "String"},
                        {"name": "seal", "type": "LedgerSeal"},
                    ],
                },
                {
                    "name": "LedgerArchiveDoc",
                    "fields": [
                        {"name": "attachment_id", "type": "uuid!"},
                        {"name": "code", "type": "String!"},
                        {"name": "title", "type": "String!"},
                        {"name": "file_name", "type": "String!"},
                        {"name": "content_type", "type": "String!"},
                        {"name": "size_bytes", "type": "Int!"},
                        {"name": "unit", "type": "String!"},
                        {"name": "restricted", "type": "Boolean!"},
                        {"name": "status", "type": "String!"},
                        {"name": "archived_year", "type": "Int!"},
                    ],
                },
                {
                    "name": "LedgerAccess",
                    "fields": [
                        {"name": "id", "type": "String!"},
                        {"name": "doc_title", "type": "String!"},
                        {"name": "file_name", "type": "String!"},
                        {"name": "viewer", "type": "String!"},
                        {"name": "opened_at", "type": "String!"},
                    ],
                },
                {
                    "name": "LedgerArchive",
                    "fields": [
                        {"name": "docs", "type": "[LedgerArchiveDoc!]!"},
                        {"name": "access", "type": "[LedgerAccess!]!"},
                    ],
                },
                {
                    "name": "LedgerArchiveView",
                    "fields": [
                        {"name": "attachment_id", "type": "uuid!"},
                        {"name": "title", "type": "String!"},
                        {"name": "file_name", "type": "String!"},
                        {"name": "content_type", "type": "String!"},
                        {"name": "viewer", "type": "String!"},
                        {"name": "opened_at", "type": "String!"},
                        {"name": "expires_in", "type": "Int!"},
                        {"name": "url", "type": "String!"},
                    ],
                },
                {
                    "name": "PiiEntity",
                    "fields": [
                        {"name": "entity", "type": "String!"},
                        {"name": "label", "type": "String!"},
                        {"name": "start", "type": "Int!"},
                        {"name": "end", "type": "Int!"},
                    ],
                },
                {
                    "name": "PiiCheck",
                    "fields": [
                        {"name": "masked_text", "type": "String!"},
                        {"name": "entities", "type": "[PiiEntity!]!"},
                    ],
                },
                {
                    "name": "AdminSaveResult",
                    "fields": [{"name": "entity", "type": "AdminEntity!"}, {"name": "id", "type": "uuid!"}],
                },
                {
                    "name": "AdminDeleteResult",
                    "fields": [
                        {"name": "entity", "type": "AdminEntity!"},
                        {"name": "id", "type": "uuid!"},
                        {"name": "account", "type": "String!"},
                    ],
                },
                {
                    "name": "AdminAccountResult",
                    "fields": [
                        {"name": "person_id", "type": "uuid!"},
                        {"name": "username", "type": "String!"},
                        {"name": "temporary_password", "type": "String"},
                        {"name": "error", "type": "String"},
                    ],
                },
                {
                    "name": "AdminImportError",
                    "fields": [{"name": "row", "type": "Int!"}, {"name": "message", "type": "String!"}],
                },
                {
                    "name": "AdminImportCreated",
                    "fields": [
                        {"name": "row", "type": "Int!"},
                        {"name": "person_id", "type": "uuid!"},
                        {"name": "full_name", "type": "String!"},
                        {"name": "username", "type": "String!"},
                        {"name": "email", "type": "String"},
                    ],
                },
                {
                    "name": "AdminImportResult",
                    "fields": [
                        {"name": "kind", "type": "AdminEntity!"},
                        {"name": "total", "type": "Int!"},
                        {"name": "valid", "type": "Int!"},
                        {"name": "applied", "type": "Boolean!"},
                        {"name": "dry_run", "type": "Boolean!"},
                        {"name": "errors", "type": "[AdminImportError!]!"},
                        {"name": "created", "type": "[AdminImportCreated!]!"},
                    ],
                },
                {
                    "name": "AdminTemplate",
                    "fields": [{"name": "file_name", "type": "String!"}, {"name": "content_base64", "type": "String!"}],
                },
                {
                    "name": "AuditChainProblem",
                    "fields": [
                        {"name": "seq", "type": "Int"},
                        {"name": "log_id", "type": "Int"},
                        {"name": "problem", "type": "String!"},
                    ],
                },
                {
                    "name": "AiAskResult",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "status", "type": "String!"},
                        {"name": "position", "type": "Int!"},
                    ],
                },
                {
                    "name": "AiAssistant",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "name", "type": "String!"},
                        {"name": "model", "type": "String!"},
                        {"name": "ready", "type": "Boolean!"},
                    ],
                },
                {
                    "name": "AiAssistants",
                    "fields": [
                        {"name": "ai_enabled", "type": "Boolean!"},
                        {"name": "assistants", "type": "[AiAssistant!]!"},
                    ],
                },
                {
                    "name": "AiModel",
                    "fields": [
                        {"name": "name", "type": "String!"},
                        {"name": "size_bytes", "type": "bigint"},
                        {"name": "family", "type": "String"},
                    ],
                },
                {
                    "name": "AiModels",
                    "fields": [
                        {"name": "ai_enabled", "type": "Boolean!"},
                        {"name": "models", "type": "[AiModel!]!"},
                        {"name": "loaded", "type": "[jsonb!]!"},
                    ],
                },
                {
                    "name": "AiAgentStats",
                    "fields": [
                        {"name": "agent_id", "type": "uuid!"},
                        {"name": "questions", "type": "Int!"},
                        {"name": "answered", "type": "Int!"},
                        {"name": "avg_seconds", "type": "Float"},
                        {"name": "p90_seconds", "type": "Float"},
                        {"name": "first_token_seconds", "type": "Float"},
                        {"name": "cold_starts", "type": "Int!"},
                        {"name": "scope_refused", "type": "Int!"},
                        {"name": "prompt_refused", "type": "Int!"},
                        {"name": "errors", "type": "Int!"},
                        {"name": "pending", "type": "Int!"},
                        {"name": "prompt_tokens", "type": "Int!"},
                        {"name": "completion_tokens", "type": "Int!"},
                        {"name": "reused", "type": "Int!"},
                        {"name": "retried", "type": "Int!"},
                        {"name": "tokens_per_second", "type": "Float"},
                        {"name": "avg_context_tokens", "type": "Float"},
                    ],
                },
                {
                    "name": "AiAgent",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "name", "type": "String!"},
                        {"name": "model", "type": "String!"},
                        {"name": "status", "type": "String!"},
                        {"name": "guardrail_config", "type": "jsonb!"},
                        {"name": "tool_list", "type": "jsonb!"},
                    ],
                },
                {
                    "name": "AiAgentAutomation",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "triggers", "type": "jsonb!"},
                        {"name": "instructions", "type": "String"},
                        {"name": "allowed_actions", "type": "jsonb!"},
                        {"name": "autonomy", "type": "String!"},
                        {"name": "webhook_url", "type": "String"},
                    ],
                },
                {
                    "name": "AiAgentTriggerOptions",
                    "fields": [
                        {"name": "events", "type": "jsonb!"},
                        {"name": "actions", "type": "jsonb!"},
                        {"name": "autonomy", "type": "jsonb!"},
                    ],
                },
                {
                    "name": "ProcessScriptTest",
                    "fields": [
                        {"name": "ok", "type": "Boolean!"},
                        {"name": "error", "type": "String"},
                        {"name": "line", "type": "Int"},
                        {"name": "outputs", "type": "jsonb!"},
                        {"name": "log", "type": "jsonb!"},
                        {"name": "steps", "type": "Int!"},
                    ],
                },
                {
                    "name": "AiAgentRemoved",
                    "fields": [
                        {"name": "id", "type": "uuid!"},
                        {"name": "deleted", "type": "Boolean!"},
                        {"name": "message", "type": "String!"},
                    ],
                },
                {
                    "name": "AuditChainResult",
                    "fields": [
                        {"name": "tenant_id", "type": "uuid!"},
                        {"name": "ok", "type": "Boolean!"},
                        {"name": "checked", "type": "Int!"},
                        {"name": "head_seq", "type": "Int!"},
                        {"name": "head_hash", "type": "String"},
                        {"name": "problems", "type": "[AuditChainProblem!]!"},
                    ],
                },
            ],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out", default=str(pathlib.Path(__file__).resolve().parents[3] / "infra/platform/hasura/metadata.json")
    )
    args = parser.parse_args()
    with psycopg.connect(config.load().database_url) as conn:
        metadata = build(conn)
    pathlib.Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(args.out).write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"đã ghi {args.out}: {len(metadata['sources'][0]['tables'])} bảng")


if __name__ == "__main__":
    main()
