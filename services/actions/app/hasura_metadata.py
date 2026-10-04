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

SCHEMAS = ("core", "wf", "proc", "ic")
HIDDEN = {("wf", "flow_sync"), ("wf", "v_flow_state")}
ROLE = "user"
ADMIN_ROLE = "platform_admin"   # realm role Keycloak, bắt buộc OTP (ADR #32)
ACCOUNT_ROLE = "account"        # đã đăng nhập, chưa chọn tenant: chỉ gọi my_tenants
ME = "X-Hasura-User-Id"
TENANT = {"tenant_id": {"_eq": "X-Hasura-Tenant-Id"}}

# Bảng chỉ dành cho quản trị (chưa mở cho role user).
ADMIN_ONLY = {("core", "role"), ("core", "role_permission"), ("core", "role_grant"),
              ("core", "team"), ("core", "team_member"), ("core", "tenant_relation")}

# Computed field can_read: bảng -> hàm (schema, name).
CAN_READ = {
    ("proc", "purchase_request"): ("proc", "purchase_request_can_read"),
    ("wf", "approval_step"): ("wf", "approval_step_can_read"),
    ("wf", "approval_history"): ("wf", "approval_history_can_read"),
    ("wf", "task"): ("wf", "task_can_read"),
}

# Bộ lọc xem riêng cho một số bảng (mặc định: cùng tenant).
SELECT_FILTER = {
    ("core", "tenant"): {"id": {"_eq": "X-Hasura-Tenant-Id"}},
    ("core", "permission"): {},
    ("core", "delegation"): {"_and": [TENANT, {"_or": [{"delegator_id": {"_eq": ME}},
                                                        {"delegate_id": {"_eq": ME}}]}]},
    ("wf", "v_inbox"): {"_and": [TENANT, {"person_id": {"_eq": ME}}]},
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
]

PR_EDITABLE = ["title", "category_code", "total_amount", "ic_order_id"]


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
           WHERE table_schema = ANY(%s)""", (list(SCHEMAS),)):
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
        existing = {r["name"] for k in ("object_relationships", "array_relationships")
                    for r in entries[source].get(k, [])}
        if name in existing:
            raise ValueError(f"Trùng tên quan hệ {name} trên {source}")
        entries[source].setdefault(key, []).append({
            "name": name,
            "using": {"manual_configuration": {
                "remote_table": {"schema": target[0], "name": target[1]},
                "column_mapping": mapping,
            }},
        })

    # Tên quan hệ mảng: <bảng con>s, hoặc <bảng con>s_by_<cột> khi một bảng con có nhiều khóa tới cùng bảng cha.
    fk_count = defaultdict(int)
    for s, t, ts, tt, *_ in fks:
        fk_count[(s, t, ts, tt)] += 1

    for s, t, ts, tt, _name, src_cols, dst_cols in fks:
        own = [c for c in src_cols if c != "tenant_id"] or list(src_cols)
        obj_name = _strip(own[0])
        if obj_name in columns[(s, t)]:  # cột không có hậu tố _id, ví dụ acted_by → acted_by_person
            obj_name = f"{obj_name}_{tt}"
        mapping = dict(zip(src_cols, dst_cols))
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
            entries[key]["computed_fields"] = [{
                "name": "can_read",
                "definition": {"function": {"schema": fs, "name": fn}, "session_argument": "hasura_session"},
                "comment": "Người gọi có được xem chứng từ không",
            }]

    for key, entry in entries.items():
        if key in ADMIN_ONLY:
            if "tenant_id" in columns[key]:
                entry["select_permissions"] = [{"role": ADMIN_ROLE, "permission": {
                    "columns": "*", "filter": TENANT, "allow_aggregations": True}}]
            continue
        if key in SELECT_FILTER:
            flt = SELECT_FILTER[key]
        elif "tenant_id" in columns[key]:
            flt = TENANT
        else:
            continue
        perm = {"columns": "*", "filter": flt, "allow_aggregations": True}
        if key in CAN_READ:
            perm["filter"] = {"_and": [TENANT, {"can_read": {"_eq": True}}]}
            perm["computed_fields"] = ["can_read"]
        # platform_admin xem như người dùng thường, cộng thêm các bảng phân quyền.
        entry["select_permissions"] = [{"role": ROLE, "permission": perm}, {"role": ADMIN_ROLE, "permission": perm}]

    pr = entries[("proc", "purchase_request")]
    own_draft = {"_and": [TENANT, {"requester_id": {"_eq": ME}}, {"status": {"_in": ["DRAFT", "RETURNED"]}}]}
    pr["insert_permissions"] = [{"role": ROLE, "permission": {
        "check": {},
        "set": {"tenant_id": "X-Hasura-Tenant-Id", "requester_id": ME},
        "columns": ["requester_position_id", *PR_EDITABLE],
    }}]
    pr["update_permissions"] = [{"role": ROLE, "permission": {
        "filter": own_draft, "check": {"status": {"_in": ["DRAFT", "RETURNED"]}}, "columns": PR_EDITABLE,
    }}]
    pr["delete_permissions"] = [{"role": ROLE, "permission": {
        "filter": {"_and": [TENANT, {"requester_id": {"_eq": ME}}, {"status": {"_eq": "DRAFT"}}]},
    }}]

    return {
        "version": 3,
        "sources": [{
            "name": "bms",
            "kind": "postgres",
            "tables": [entries[k] for k in sorted(entries)],
            "configuration": {"connection_info": {
                "database_url": {"from_env": "BMS_DATABASE_URL"},
                "isolation_level": "read-committed",
                "use_prepared_statements": True,
            }},
        }],
        "actions": [
            {
                "name": "my_tenants",
                "definition": {
                    "kind": "synchronous", "type": "query",
                    "handler": "{{ACTIONS_URL}}/actions/my_tenants",
                    "arguments": [],
                    "output_type": "[AccountTenant!]!",
                    "headers": [{"name": "x-actions-secret", "value_from_env": "ACTIONS_SECRET"}],
                    "timeout": 10,
                },
                "permissions": [{"role": ACCOUNT_ROLE}, {"role": ROLE}, {"role": ADMIN_ROLE}],
                "comment": "Các tenant tài khoản được vào (chọn tenant khi đăng nhập, ADR #30)",
            },
            {
                "name": "submit_purchase_request",
                "definition": {
                    "kind": "synchronous", "type": "mutation",
                    "handler": "{{ACTIONS_URL}}/actions/submit_purchase_request",
                    "arguments": [{"name": "request_id", "type": "uuid!"}],
                    "output_type": "PurchaseRequestActionResult",
                    "headers": [{"name": "x-actions-secret", "value_from_env": "ACTIONS_SECRET"}],
                    "timeout": 30,
                },
                "permissions": [{"role": ROLE}, {"role": ADMIN_ROLE}],
                "comment": "Gửi duyệt đề nghị mua sắm (người lập)",
            },
            {
                "name": "act_on_task",
                "definition": {
                    "kind": "synchronous", "type": "mutation",
                    "handler": "{{ACTIONS_URL}}/actions/act_on_task",
                    "arguments": [{"name": "task_id", "type": "uuid!"},
                                  {"name": "decision", "type": "ApprovalDecision!"},
                                  {"name": "note", "type": "String"}],
                    "output_type": "PurchaseRequestActionResult",
                    "headers": [{"name": "x-actions-secret", "value_from_env": "ACTIONS_SECRET"}],
                    "timeout": 30,
                },
                "permissions": [{"role": ROLE}, {"role": ADMIN_ROLE}],
                "comment": "Duyệt / từ chối / trả về một việc duyệt (kể cả duyệt thay qua ủy quyền)",
            },
        ],
        "custom_types": {
            "enums": [{"name": "ApprovalDecision",
                       "values": [{"value": "APPROVE"}, {"value": "REJECT"}, {"value": "RETURN"}]}],
            "objects": [{
                "name": "AccountTenant",
                "fields": [{"name": "tenant_id", "type": "uuid!"}, {"name": "tenant_code", "type": "String!"},
                           {"name": "tenant_name", "type": "String!"}, {"name": "person_id", "type": "uuid!"},
                           {"name": "full_name", "type": "String!"}],
            }, {
                "name": "PurchaseRequestActionResult",
                "fields": [{"name": "request_id", "type": "uuid!"}, {"name": "status", "type": "String!"}],
                "relationships": [{
                    "name": "purchase_request", "type": "object", "source": "bms",
                    "remote_table": {"schema": "proc", "name": "purchase_request"},
                    "field_mapping": {"request_id": "id"},
                }],
            }],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(pathlib.Path(__file__).resolve().parents[3] / "platform/hasura/metadata.json"))
    args = parser.parse_args()
    with psycopg.connect(config.load().database_url) as conn:
        metadata = build(conn)
    pathlib.Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(args.out).write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"đã ghi {args.out}: {len(metadata['sources'][0]['tables'])} bảng")


if __name__ == "__main__":
    main()
