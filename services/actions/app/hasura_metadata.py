# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Sinh metadata Hasura từ CSDL (ADR #24).

Quan hệ suy ra từ khóa ngoại; phân quyền khai báo ở đây; quyền chi tiết là hàm
SQL dùng làm computed field `can_read`. Kết quả ghi vào platform/hasura/metadata.json
(commit vào Git); job bootstrap nạp bằng replace_metadata.

    python -m app.hasura_metadata [--out đường_dẫn]   # cần DATABASE_URL trỏ tới CSDL đã migrate
"""

import argparse
import json
import pathlib
from collections import defaultdict

import psycopg

from . import config

SCHEMAS = ("core", "mdm", "wf", "proc", "ic", "mfg", "collab", "audit", "hr")
# hr.private_access: chỉ xem qua nhật ký kiểm toán (audit.log), không mở cho giao diện.
HIDDEN = {
    ("wf", "flow_sync"),
    ("wf", "v_flow_state"),
    ("core", "doc_sequence"),
    ("audit", "chain_head"),
    ("hr", "private_access"),
}
ROLE = "user"
ADMIN_ROLE = "platform_admin"  # realm role Keycloak, bắt buộc OTP (ADR #32)
ACCOUNT_ROLE = "account"  # đã đăng nhập, chưa chọn tenant: chỉ gọi my_tenants
ME = "X-Hasura-User-Id"
TENANT = {"tenant_id": {"_eq": "X-Hasura-Tenant-Id"}}

# Bảng chỉ dành cho quản trị nền tảng (chưa mở cho role user).
ADMIN_ONLY = {("core", "tenant_relation")}

# Người có quyền quản trị trong tenant (core.v_admin, ADR #44) xem được vai trò, cấp quyền, nhóm.
IS_ADMIN = {
    "_exists": {
        "_table": {"schema": "core", "name": "v_admin"},
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

# Computed field can_read: bảng -> hàm (schema, name).
CAN_READ = {
    ("proc", "purchase_request"): ("proc", "purchase_request_can_read"),
    ("wf", "approval_step"): ("wf", "approval_step_can_read"),
    ("wf", "approval_history"): ("wf", "approval_history_can_read"),
    ("wf", "task"): ("wf", "task_can_read"),
    ("collab", "comment"): ("collab", "comment_can_read"),
    ("core", "attachment"): ("core", "attachment_can_read"),
    ("hr", "onboarding_request"): ("hr", "onboarding_request_can_read"),
    ("ic", "ic_order"): ("ic", "ic_order_can_read"),
    ("proc", "purchase_order"): ("proc", "purchase_order_can_read"),
}

# Computed field thêm (tên → hàm), cùng tham số phiên Hasura.
EXTRA_COMPUTED = {
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

# Cột nội bộ không trả cho giao diện.
HIDDEN_COLUMNS = {
    ("core", "attachment"): {"storage_key"},
    # Bản mã dữ liệu nhạy cảm chỉ Action đọc (ADR #41); giao diện thấy bản che.
    ("hr", "onboarding_request"): {
        "national_id_enc",
        "bank_account_enc",
        "address_enc",
        "initial_password_enc",
        "account_attempts",
    },
    # Dữ liệu trước/sau có thể chứa dữ liệu cá nhân: chỉ đọc bản đã che qua Action audit_log_detail (ADR #43).
    ("audit", "log"): {"old_data", "new_data"},
}

# Bộ lọc xem riêng cho một số bảng (mặc định: cùng tenant).
SELECT_FILTER = {
    ("core", "tenant"): {"id": {"_eq": "X-Hasura-Tenant-Id"}},
    ("core", "permission"): {},
    ("core", "delegation"): {"_and": [TENANT, {"_or": [{"delegator_id": {"_eq": ME}}, {"delegate_id": {"_eq": ME}}]}]},
    ("wf", "v_inbox"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    # Quyền của chính người gọi (giao diện dựng luật CASL), không xem quyền của người khác.
    ("core", "v_permission_grant"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("collab", "notification"): {"_and": [TENANT, {"recipient_id": {"_eq": ME}}]},
    # Nhật ký: người có quyền audit.read trong tenant (audit.v_reader).
    ("audit", "log"): {"_and": [TENANT, {"readers": {"person_id": {"_eq": ME}}}]},
    ("audit", "v_reader"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    ("core", "v_admin"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
    **{key: {"_and": [TENANT, IS_ADMIN]} for key in ADMIN_READ},
    ("proc", "purchase_request_item"): {"_and": [TENANT, {"request": {"can_read": {"_eq": True}}}]},
    ("ic", "ic_order_item"): {"_and": [TENANT, {"order": {"can_read": {"_eq": True}}}]},
    ("proc", "purchase_order_item"): {"_and": [TENANT, {"order": {"can_read": {"_eq": True}}}]},
}

# Quan hệ không có khóa ngoại (chứng từ được duyệt là đa hình: entity_type + entity_id).
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
    # Đề nghị tiếp nhận nhân sự (ADR #41): cùng các bảng đa hình như đề nghị mua sắm.
    ("object", ("wf", "approval_step"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("object", ("wf", "approval_history"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("array", ("hr", "onboarding_request"), "approval_steps", ("wf", "approval_step"), {"id": "entity_id"}),
    ("array", ("hr", "onboarding_request"), "approval_history", ("wf", "approval_history"), {"id": "entity_id"}),
    ("object", ("wf", "v_inbox"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("object", ("collab", "comment"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("array", ("hr", "onboarding_request"), "comments", ("collab", "comment"), {"id": "entity_id"}),
    ("object", ("collab", "notification"), "onboarding_request", ("hr", "onboarding_request"), {"entity_id": "id"}),
    ("array", ("hr", "onboarding_request"), "attachments", ("core", "attachment"), {"id": "entity_id"}),
    # Đơn hàng nội bộ (ADR #42): bình luận, thông báo.
    ("object", ("collab", "comment"), "ic_order", ("ic", "ic_order"), {"entity_id": "id"}),
    ("array", ("ic", "ic_order"), "comments", ("collab", "comment"), {"id": "entity_id"}),
    ("object", ("collab", "notification"), "ic_order", ("ic", "ic_order"), {"entity_id": "id"}),
]

# ic_order_id do CSDL gắn khi đề nghị mua nội bộ được duyệt (ADR #42), người lập không sửa.
PR_EDITABLE = ["title", "description", "category_code", "total_amount", "needed_by", "partner_id"]
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

    # Tên quan hệ mảng: <bảng con>s, hoặc <bảng con>s_by_<cột> khi một bảng con có nhiều khóa tới cùng bảng cha.
    fk_count = defaultdict(int)
    for s, t, ts, tt, *_ in fks:
        fk_count[(s, t, ts, tt)] += 1

    for s, t, ts, tt, _name, src_cols, dst_cols in fks:
        own = [c for c in src_cols if c != "tenant_id"] or list(src_cols)
        obj_name = _strip(own[0])
        if obj_name in columns[(s, t)]:  # cột không có hậu tố _id, ví dụ acted_by → acted_by_person
            obj_name = f"{obj_name}_{tt}"
        mapping = dict(zip(src_cols, dst_cols, strict=True))
        add_rel("object", (s, t), obj_name, (ts, tt), mapping)
        if (ts, tt) == ("core", "tenant"):
            continue  # không sinh quan hệ mảng từ tenant (quá rộng)
        arr = _plural(t) if fk_count[(s, t, ts, tt)] == 1 else f"{_plural(t)}_by_{obj_name}"
        if (s, t) == (ts, tt):
            arr = "children" if obj_name == "parent" else f"{_plural(t)}_by_{obj_name}"
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
        # platform_admin xem như người dùng thường, cộng thêm các bảng phân quyền.
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

    # Dòng hàng: người lập sửa khi đề nghị còn nháp hoặc bị trả về (CSDL cũng chặn).
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

    # Bình luận: người viết là người gọi; CSDL kiểm tra quyền xem chứng từ và người được nhắc tên.
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

    # Đề nghị tiếp nhận: người lập sửa khi còn nháp hoặc bị trả về; dữ liệu nhạy cảm chỉ ghi qua Action.
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

    # Dữ liệu chủ: đội nền tảng nhập (người dùng thường chỉ xem).
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
                "Sơ đồ BPMN và bước hiện tại của lần gửi duyệt gần nhất (cho bpmn-js)",
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
                "admin_import_template",
                "query",
                [("kind", "AdminEntity!")],
                "AdminTemplate!",
                [ROLE, ADMIN_ROLE],
                "Tệp mẫu XLSX để nhập hàng loạt",
            ),
        ],
        "custom_types": {
            "input_objects": [
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
                {"name": "SearchKind", "values": [{"value": "purchase_request"}, {"value": "attachment"}]},
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
                        )
                    ],
                },
            ],
            "objects": [
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
                        _attachment_rel(),
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
        "--out", default=str(pathlib.Path(__file__).resolve().parents[3] / "platform/hasura/metadata.json")
    )
    args = parser.parse_args()
    with psycopg.connect(config.load().database_url) as conn:
        metadata = build(conn)
    pathlib.Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(args.out).write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"đã ghi {args.out}: {len(metadata['sources'][0]['tables'])} bảng")


if __name__ == "__main__":
    main()
