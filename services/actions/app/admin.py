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

import base64
import csv
import io
import logging
from collections.abc import Callable
from datetime import date, datetime

import psycopg
from psycopg import Rollback

from . import i18n
from .common import ActionError, Context, bind_session

log = logging.getLogger("admin")

ORG = "core.org.manage"
PERM = "core.permission.manage"
MDM = "mdm.manage"

ASSIGNMENT_TYPES = {"PRIMARY", "CONCURRENT", "ACTING", "CONTRACT"}
SCOPES = {"TENANT", "SUBTREE", "UNIT", "SELF"}
CATALOGS = {"UNIT_TYPE": ORG, "JOB_TITLE": ORG, "ITEM_CATEGORY": MDM}

TZ = "Asia/Ho_Chi_Minh"


class Admin:
    def __init__(self, conn: psycopg.Connection, session: dict):
        self.conn = conn
        self.person = session.get("x-hasura-user-id")
        self.tenant = session.get("x-hasura-tenant-id")
        if not self.person or not self.tenant:
            raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
        root = conn.execute(
            """SELECT id FROM core.org_unit
               WHERE tenant_id = %s AND parent_id IS NULL AND valid_period @> now()
               ORDER BY created_at LIMIT 1""",
            (self.tenant,),
        ).fetchone()
        self.root = root[0] if root else None
        bind_session(conn, session)

    def require(self, permission: str, unit=None) -> None:
        unit = unit or self.root
        ok = (
            unit is not None
            and self.conn.execute("SELECT core.has_permission(%s, %s, %s)", (self.person, permission, unit)).fetchone()[
                0
            ]
        )
        if not ok:
            raise ActionError(f"Bạn không có quyền {permission} ở đơn vị này", "forbidden", 403)

    def one(self, sql: str, params: tuple, missing: str):
        row = self.conn.execute(sql, params).fetchone()
        if row is None:
            raise ActionError(missing, "not-found", 404)
        return row


def _text(data: dict, key: str, label: str, required: bool = True) -> str | None:
    value = data.get(key)
    value = str(value).strip() if value is not None else ""
    if not value:
        if required:
            raise ActionError(f"Thiếu {label}")
        return None
    return value


def _bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "x", "có", "co", "yes", "y", "đúng"}


def _coord(value, label: str, limit: int) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(str(value).strip().replace(",", "."))
    except ValueError as exc:
        raise ActionError(f"{label} phải là số thập phân") from exc
    if not -limit <= number <= limit:
        raise ActionError(f"{label} phải trong khoảng ±{limit}")
    return round(number, 5)


def _location(data: dict) -> dict | None:
    if not any(k in data for k in ("province", "lat", "lng")):
        return None
    lat, lng = _coord(data.get("lat"), "Vĩ độ", 90), _coord(data.get("lng"), "Kinh độ", 180)
    if (lat is None) != (lng is None):
        raise ActionError("Nhập đủ cả vĩ độ và kinh độ (hoặc bỏ trống cả hai)")
    return {"province": _text(data, "province", "tỉnh / thành", required=False), "lat": lat, "lng": lng}


def _date(value, label: str) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt, size in (("%Y-%m-%d", 10), ("%d/%m/%Y", 10), ("%d-%b-%Y", 11)):
        try:
            return datetime.strptime(text[:size], fmt).date()
        except ValueError:
            continue
    raise ActionError(f"{label} không đúng dạng ngày (dd-mmm-yyyy): {value}")


def _period(data: dict, end_required: bool = False) -> tuple[date | None, date | None]:
    start = _date(data.get("valid_from"), "Từ ngày")
    end = _date(data.get("valid_to"), "Đến ngày")
    if end_required and end is None:
        raise ActionError("Cần ngày kết thúc")
    if start and end and end < start:
        raise ActionError("Đến ngày phải sau từ ngày")
    return start, end


RANGE_SQL = (
    f"tstzrange(coalesce((%s::date)::timestamp AT TIME ZONE '{TZ}', now()), "
    f"((%s::date + 1)::timestamp AT TIME ZONE '{TZ}'))"
)


def _unit_by_code(a: Admin, code: str):
    return a.one(
        "SELECT id FROM core.org_unit WHERE tenant_id = %s AND code = %s AND valid_period @> now()",
        (a.tenant, code),
        f"Không có đơn vị mã {code}",
    )[0]


def _catalog_by_code(a: Admin, catalog: str, code: str):
    return a.one(
        "SELECT id FROM core.catalog_item WHERE tenant_id = %s AND catalog = %s AND code = %s",
        (a.tenant, catalog, code),
        f"Không có mục {code} trong danh mục {catalog}",
    )[0]


def _ref(a: Admin, data: dict, id_key: str, code_key: str, resolve: Callable[[str], object], required=True):
    if data.get(id_key):
        return data[id_key]
    code = _text(data, code_key, code_key, required=False)
    if code:
        return resolve(code)
    if required:
        raise ActionError(f"Thiếu {code_key}")
    return None


HELD_FROM_NOW = "(upper_inf(x.valid_period) OR upper(x.valid_period) > now())"


def _position_candidates(a: Admin, ref: str) -> list:
    unit_code, sep, name = ref.partition("/")
    if not sep or not name.strip():
        raise ActionError(f"Vị trí phải ghi dạng MÃ_ĐƠN_VỊ/Tên vị trí: {ref}")
    unit = _unit_by_code(a, unit_code.strip())
    rows = a.conn.execute(
        f"""SELECT p.id FROM core.position p
            WHERE p.tenant_id = %s AND p.org_unit_id = %s AND p.name = %s AND p.valid_period @> now()
            ORDER BY EXISTS (SELECT 1 FROM core.assignment x WHERE x.position_id = p.id AND {HELD_FROM_NOW}),
                     p.created_at, p.id""",
        (a.tenant, unit, name.strip()),
    ).fetchall()
    if not rows:
        raise ActionError(f"Không có vị trí {ref}", "not-found", 404)
    return [r[0] for r in rows]


def _position_ref(a: Admin, ref: str):
    return _position_candidates(a, ref)[0]


def _belongs(a: Admin, table: str, row_id) -> None:
    a.one(f"SELECT 1 FROM {table} WHERE id = %s AND tenant_id = %s", (row_id, a.tenant), "Không tìm thấy bản ghi")


def save_org_unit(a: Admin, data: dict) -> str:
    unit_id = data.get("id")
    code = _text(data, "code", "mã đơn vị")
    name = _text(data, "name", "tên đơn vị")
    unit_type = _ref(a, data, "unit_type_id", "unit_type_code", lambda c: _catalog_by_code(a, "UNIT_TYPE", c))
    parent = _ref(a, data, "parent_id", "parent_code", lambda c: _unit_by_code(a, c), required=False)
    legal = _bool(data.get("is_legal_entity"))
    hr_unit = _bool(data.get("is_hr"))
    location = _location(data)
    if unit_id is None and code:
        row = a.conn.execute(
            "SELECT id FROM core.org_unit WHERE tenant_id = %s AND code = %s", (a.tenant, code)
        ).fetchone()
        unit_id = row[0] if row else None
    if unit_id is None:
        if parent is None:
            raise ActionError("Đơn vị mới phải có đơn vị cha")
        a.require(ORG, parent)
        loc = location or {"province": None, "lat": None, "lng": None}
        return str(
            a.conn.execute(
                """INSERT INTO core.org_unit (tenant_id, parent_id, unit_type_id, code, name, is_legal_entity,
                                              is_hr, province, lat, lng)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (a.tenant, parent, unit_type, code, name, legal, hr_unit, loc["province"], loc["lat"], loc["lng"]),
            ).fetchone()[0]
        )
    old_parent = a.one(
        "SELECT parent_id FROM core.org_unit WHERE id = %s AND tenant_id = %s",
        (unit_id, a.tenant),
        "Không tìm thấy đơn vị",
    )[0]
    a.require(ORG, unit_id)
    if parent is None:
        parent = old_parent
    if str(parent or "") != str(old_parent or ""):
        if old_parent is None:
            raise ActionError("Không chuyển được đơn vị gốc của tenant")
        a.require(ORG, parent)
    a.conn.execute(
        """UPDATE core.org_unit SET parent_id = %s, unit_type_id = %s, code = %s, name = %s,
                             is_legal_entity = %s, is_hr = %s WHERE id = %s""",
        (parent, unit_type, code, name, legal, hr_unit, unit_id),
    )
    if location is not None:
        a.conn.execute(
            "UPDATE core.org_unit SET province = %s, lat = %s, lng = %s WHERE id = %s",
            (location["province"], location["lat"], location["lng"], unit_id),
        )
    return str(unit_id)


def close_org_unit(a: Admin, unit_id, end: date | None) -> str:
    _belongs(a, "core.org_unit", unit_id)
    a.require(ORG, unit_id)
    if a.conn.execute("SELECT parent_id IS NULL FROM core.org_unit WHERE id = %s", (unit_id,)).fetchone()[0]:
        raise ActionError("Không ngừng được đơn vị gốc của tenant")
    if a.conn.execute(
        """SELECT 1 FROM core.org_unit WHERE parent_id = %s AND upper_inf(valid_period)
                         LIMIT 1""",
        (unit_id,),
    ).fetchone():
        raise ActionError("Đơn vị còn đơn vị con đang hoạt động: ngừng hoặc chuyển đơn vị con trước")
    if a.conn.execute(
        """SELECT 1 FROM core.position WHERE org_unit_id = %s AND upper_inf(valid_period)
                         LIMIT 1""",
        (unit_id,),
    ).fetchone():
        raise ActionError("Đơn vị còn vị trí đang dùng: ngừng các vị trí trước")
    _end(a, "core.org_unit", unit_id, end)
    return str(unit_id)


def save_position(a: Admin, data: dict) -> str:
    pos_id = data.get("id")
    name = _text(data, "name", "tên vị trí")
    unit = _ref(a, data, "org_unit_id", "unit_code", lambda c: _unit_by_code(a, c))
    job = _ref(a, data, "job_title_id", "job_title_code", lambda c: _catalog_by_code(a, "JOB_TITLE", c), required=False)
    reports = _ref(a, data, "reports_to_id", "reports_to", lambda r: _position_ref(a, r), required=False)
    head = _bool(data.get("is_head"))
    if pos_id is None:
        row = a.conn.execute(
            """SELECT id FROM core.position WHERE tenant_id = %s AND org_unit_id = %s
                                AND name = %s AND upper_inf(valid_period)""",
            (a.tenant, unit, name),
        ).fetchone()
        pos_id = row[0] if row else None
    a.require(ORG, unit)
    if pos_id is None:
        return str(
            a.conn.execute(
                """INSERT INTO core.position (tenant_id, org_unit_id, job_title_id, name, is_head, reports_to_id)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                (a.tenant, unit, job, name, head, reports),
            ).fetchone()[0]
        )
    old_unit = a.one(
        "SELECT org_unit_id FROM core.position WHERE id = %s AND tenant_id = %s",
        (pos_id, a.tenant),
        "Không tìm thấy vị trí",
    )[0]
    a.require(ORG, old_unit)
    a.conn.execute(
        """UPDATE core.position SET org_unit_id = %s, job_title_id = %s, name = %s, is_head = %s,
                             reports_to_id = %s WHERE id = %s""",
        (unit, job, name, head, reports, pos_id),
    )
    return str(pos_id)


def close_position(a: Admin, pos_id, end: date | None) -> str:
    unit = a.one(
        "SELECT org_unit_id FROM core.position WHERE id = %s AND tenant_id = %s",
        (pos_id, a.tenant),
        "Không tìm thấy vị trí",
    )[0]
    a.require(ORG, unit)
    if a.conn.execute(
        """SELECT 1 FROM core.assignment WHERE position_id = %s AND upper_inf(valid_period)
                         LIMIT 1""",
        (pos_id,),
    ).fetchone():
        raise ActionError("Vị trí còn người giữ: kết thúc bổ nhiệm trước")
    _end(a, "core.position", pos_id, end)
    return str(pos_id)


def save_person(a: Admin, data: dict) -> str:
    person_id = data.get("id")
    name = _text(data, "full_name", "họ tên")
    code = _text(data, "employee_code", "mã nhân viên", required=False)
    a.require(ORG)
    if person_id is None and code:
        row = a.conn.execute(
            "SELECT id FROM core.person WHERE tenant_id = %s AND employee_code = %s", (a.tenant, code)
        ).fetchone()
        person_id = row[0] if row else None
    if person_id is None:
        return str(
            a.conn.execute(
                "INSERT INTO core.person (tenant_id, full_name, employee_code) VALUES (%s, %s, %s) RETURNING id",
                (a.tenant, name, code),
            ).fetchone()[0]
        )
    _belongs(a, "core.person", person_id)
    a.conn.execute("UPDATE core.person SET full_name = %s, employee_code = %s WHERE id = %s", (name, code, person_id))
    return str(person_id)


def _person_by_code(a: Admin, code: str):
    return a.one(
        "SELECT id FROM core.person WHERE tenant_id = %s AND employee_code = %s",
        (a.tenant, code),
        f"Không có nhân viên mã {code}",
    )[0]


def save_assignment(a: Admin, data: dict) -> str:
    if data.get("id"):
        raise ActionError("Bổ nhiệm không sửa được: kết thúc bổ nhiệm cũ rồi bổ nhiệm mới")
    person = _ref(a, data, "person_id", "employee_code", lambda c: _person_by_code(a, c))
    position = _ref(a, data, "position_id", "position", lambda r: _position_ref(a, r))
    kind = (_text(data, "assignment_type", "loại bổ nhiệm", required=False) or "PRIMARY").upper()
    kind = ASSIGNMENT_LABELS.get(kind.lower(), kind)
    if kind not in ASSIGNMENT_TYPES:
        raise ActionError(f"Loại bổ nhiệm không hợp lệ: {kind}")
    start, end = _period(data, end_required=kind == "CONTRACT")
    unit = a.one(
        "SELECT org_unit_id FROM core.position WHERE id = %s AND tenant_id = %s",
        (position, a.tenant),
        "Không tìm thấy vị trí",
    )[0]
    _belongs(a, "core.person", person)
    a.require(ORG, unit)
    return str(
        a.conn.execute(
            f"""INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period,
                                         contract_no, contract_partner)
            VALUES (%s, %s, %s, %s, {RANGE_SQL}, %s, %s) RETURNING id""",
            (
                a.tenant,
                person,
                position,
                kind,
                start,
                end,
                _text(data, "contract_no", "số hợp đồng", required=False),
                _text(data, "contract_partner", "đối tác hợp đồng", required=False),
            ),
        ).fetchone()[0]
    )


ASSIGNMENT_LABELS = {
    "giữ chính": "PRIMARY",
    "kiêm nhiệm": "CONCURRENT",
    "quyền": "ACTING",
    "hợp đồng": "CONTRACT",
    "primary": "PRIMARY",
    "concurrent": "CONCURRENT",
    "acting": "ACTING",
    "contract": "CONTRACT",
}


def close_assignment(a: Admin, assignment_id, end: date | None) -> str:
    unit = a.one(
        """SELECT p.org_unit_id FROM core.assignment x JOIN core.position p ON p.id = x.position_id
                    WHERE x.id = %s AND x.tenant_id = %s""",
        (assignment_id, a.tenant),
        "Không tìm thấy bổ nhiệm",
    )[0]
    a.require(ORG, unit)
    _end(a, "core.assignment", assignment_id, end)
    return str(assignment_id)


def save_role(a: Admin, data: dict) -> str:
    role_id = data.get("id")
    code = _text(data, "code", "mã vai trò")
    name = _text(data, "name", "tên vai trò")
    permissions = data.get("permission_codes")
    if isinstance(permissions, str):
        permissions = [p.strip() for p in permissions.replace(";", ",").split(",") if p.strip()]
    a.require(PERM)
    if role_id is None:
        row = a.conn.execute("SELECT id FROM core.role WHERE tenant_id = %s AND code = %s", (a.tenant, code)).fetchone()
        role_id = row[0] if row else None
    if role_id is None:
        role_id = a.conn.execute(
            "INSERT INTO core.role (tenant_id, code, name) VALUES (%s, %s, %s) RETURNING id", (a.tenant, code, name)
        ).fetchone()[0]
    else:
        _belongs(a, "core.role", role_id)
        a.conn.execute("UPDATE core.role SET code = %s, name = %s WHERE id = %s", (code, name, role_id))
    if permissions is not None:
        unknown = set(permissions) - {r[0] for r in a.conn.execute("SELECT code FROM core.permission")}
        if unknown:
            raise ActionError(f"Không có quyền: {', '.join(sorted(unknown))}")
        a.conn.execute(
            "DELETE FROM core.role_permission WHERE role_id = %s AND NOT permission_code = ANY(%s)",
            (role_id, list(permissions)),
        )
        for p in permissions:
            a.conn.execute(
                """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
                              VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                (a.tenant, role_id, p),
            )
    return str(role_id)


def save_role_grant(a: Admin, data: dict) -> str:
    if data.get("id"):
        raise ActionError("Cấp quyền không sửa được: thu hồi rồi cấp lại")
    role = _ref(
        a,
        data,
        "role_id",
        "role_code",
        lambda c: a.one(
            "SELECT id FROM core.role WHERE tenant_id = %s AND code = %s", (a.tenant, c), f"Không có vai trò {c}"
        )[0],
    )
    _belongs(a, "core.role", role)
    targets = {
        "position_id": _ref(a, data, "position_id", "position", lambda r: _position_ref(a, r), required=False),
        "org_unit_id": _ref(a, data, "org_unit_id", "unit_code", lambda c: _unit_by_code(a, c), required=False),
        "person_id": _ref(a, data, "person_id", "employee_code", lambda c: _person_by_code(a, c), required=False),
    }
    chosen = {k: v for k, v in targets.items() if v}
    if len(chosen) != 1:
        raise ActionError("Chọn đúng một đối tượng nhận vai trò: vị trí, đơn vị hoặc người")
    scope = (_text(data, "scope", "phạm vi", required=False) or "SUBTREE").upper()
    scope = SCOPE_LABELS.get(scope.lower(), scope)
    if scope not in SCOPES:
        raise ActionError(f"Phạm vi không hợp lệ: {scope}")
    scope_unit = _ref(a, data, "scope_unit_id", "scope_unit_code", lambda c: _unit_by_code(a, c), required=False)
    start, end = _period(data, end_required="person_id" in chosen)
    if scope == "TENANT":
        a.require(PERM)
    else:
        anchor = scope_unit or chosen.get("org_unit_id")
        if anchor is None and "position_id" in chosen:
            anchor = a.conn.execute(
                "SELECT org_unit_id FROM core.position WHERE id = %s", (chosen["position_id"],)
            ).fetchone()[0]
        a.require(PERM, anchor)
    return str(
        a.conn.execute(
            f"""INSERT INTO core.role_grant (tenant_id, role_id, person_id, position_id, org_unit_id, scope,
                                         scope_unit_id, valid_period)
            VALUES (%s, %s, %s, %s, %s, %s, %s, {RANGE_SQL}) RETURNING id""",
            (
                a.tenant,
                role,
                targets["person_id"],
                targets["position_id"],
                targets["org_unit_id"],
                scope,
                scope_unit,
                start,
                end,
            ),
        ).fetchone()[0]
    )


SCOPE_LABELS = {
    "cả tenant": "TENANT",
    "toàn tenant": "TENANT",
    "nhánh": "SUBTREE",
    "cây con": "SUBTREE",
    "đơn vị": "UNIT",
    "một đơn vị": "UNIT",
    "bản thân": "SELF",
    "whole tenant": "TENANT",
    "branch": "SUBTREE",
    "unit": "UNIT",
    "self": "SELF",
}


def close_role_grant(a: Admin, grant_id, end: date | None) -> str:
    _belongs(a, "core.role_grant", grant_id)
    a.require(PERM)
    _end(a, "core.role_grant", grant_id, end)
    return str(grant_id)


def save_catalog_item(a: Admin, data: dict) -> str:
    item_id = data.get("id")
    catalog = (_text(data, "catalog", "danh mục") or "").upper()
    if catalog not in CATALOGS:
        raise ActionError(f"Danh mục không hợp lệ: {catalog}")
    code = _text(data, "code", "mã")
    name = _text(data, "name", "tên")
    a.require(CATALOGS[catalog])
    if item_id is None:
        return str(
            a.conn.execute(
                """INSERT INTO core.catalog_item (tenant_id, catalog, code, name) VALUES (%s, %s, %s, %s)
               ON CONFLICT (tenant_id, catalog, code) DO UPDATE SET name = EXCLUDED.name RETURNING id""",
                (a.tenant, catalog, code, name),
            ).fetchone()[0]
        )
    _belongs(a, "core.catalog_item", item_id)
    a.conn.execute("UPDATE core.catalog_item SET code = %s, name = %s WHERE id = %s", (code, name, item_id))
    return str(item_id)


def save_partner(a: Admin, data: dict) -> str:
    a.require(MDM)
    internal = _ref(a, data, "internal_unit_id", "internal_unit_code", lambda c: _unit_by_code(a, c), required=False)
    values = (
        _text(data, "code", "mã nhà cung cấp"),
        _text(data, "name", "tên nhà cung cấp"),
        _text(data, "tax_code", "mã số thuế", False),
        _text(data, "address", "địa chỉ", False),
        _text(data, "email", "email", False),
        _text(data, "phone", "điện thoại", False),
        internal,
        data.get("is_active") is None or _bool(data.get("is_active")),
    )
    if data.get("id"):
        _belongs(a, "mdm.partner", data["id"])
        a.conn.execute(
            """UPDATE mdm.partner SET code = %s, name = %s, tax_code = %s, address = %s, email = %s,
                                 phone = %s, internal_unit_id = %s, is_active = %s WHERE id = %s""",
            (*values, data["id"]),
        )
        return str(data["id"])
    return str(
        a.conn.execute(
            """INSERT INTO mdm.partner (tenant_id, code, name, tax_code, address, email, phone, internal_unit_id, is_active)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, tax_code = EXCLUDED.tax_code,
               address = EXCLUDED.address, email = EXCLUDED.email, phone = EXCLUDED.phone,
               internal_unit_id = EXCLUDED.internal_unit_id, is_active = EXCLUDED.is_active
           RETURNING id""",
            (a.tenant, *values),
        ).fetchone()[0]
    )


def save_item(a: Admin, data: dict) -> str:
    a.require(MDM)
    price = data.get("ref_price")
    if price in (None, ""):
        price = None
    else:
        try:
            price = float(str(price).replace(".", "").replace(",", ".")) if isinstance(price, str) else float(price)
        except ValueError as exc:
            raise ActionError(f"Giá tham khảo không phải số: {data.get('ref_price')}") from exc
    values = (
        _text(data, "code", "mã vật tư"),
        _text(data, "name", "tên vật tư"),
        _text(data, "uom", "đơn vị tính"),
        _text(data, "category_code", "nhóm vật tư", False),
        price,
        data.get("is_active") is None or _bool(data.get("is_active")),
    )
    if data.get("id"):
        _belongs(a, "mdm.item", data["id"])
        a.conn.execute(
            """UPDATE mdm.item SET code = %s, name = %s, uom = %s, category_code = %s, ref_price = %s,
                                 is_active = %s WHERE id = %s""",
            (*values, data["id"]),
        )
        return str(data["id"])
    return str(
        a.conn.execute(
            """INSERT INTO mdm.item (tenant_id, code, name, uom, category_code, ref_price, is_active)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, uom = EXCLUDED.uom,
               category_code = EXCLUDED.category_code, ref_price = EXCLUDED.ref_price, is_active = EXCLUDED.is_active
           RETURNING id""",
            (a.tenant, *values),
        ).fetchone()[0]
    )


def _end(a: Admin, table: str, row_id, end: date | None) -> None:
    a.conn.execute(
        f"""UPDATE {table} SET valid_period = tstzrange(lower(valid_period),
                 greatest(lower(valid_period) + interval '1 millisecond',
                          coalesce(((%s::date + 1)::timestamp AT TIME ZONE '{TZ}'), now())))
            WHERE id = %s AND upper_inf(valid_period)""",
        (end, row_id),
    )


def save_storage_quota(a: Admin, data: dict) -> str:
    a.require(ORG)
    try:
        gb = float(str(data.get("quota_gb") or "").replace(",", "."))
    except ValueError as exc:
        raise ActionError("Hạn mức phải là số GB") from exc
    if not 0.1 <= gb <= 100_000:
        raise ActionError("Hạn mức từ 0,1 GB tới 100.000 GB")
    a.conn.execute("UPDATE core.tenant SET storage_quota_bytes = %s WHERE id = %s", (int(gb * 1024**3), a.tenant))
    return str(a.tenant)


SAVE: dict[str, Callable[[Admin, dict], str]] = {
    "org_unit": save_org_unit,
    "position": save_position,
    "person": save_person,
    "assignment": save_assignment,
    "role": save_role,
    "role_grant": save_role_grant,
    "catalog_item": save_catalog_item,
    "partner": save_partner,
    "item": save_item,
    "storage_quota": save_storage_quota,
}
CLOSE: dict[str, Callable[[Admin, object, date | None], str]] = {
    "org_unit": close_org_unit,
    "position": close_position,
    "assignment": close_assignment,
    "role_grant": close_role_grant,
}


def admin_save(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    entity = args["entity"]
    if entity not in SAVE:
        raise ActionError(f"Không ghi được loại dữ liệu {entity}")
    data = args.get("data") or {}
    if not isinstance(data, dict):
        raise ActionError("data phải là một đối tượng")
    return {"entity": entity, "id": SAVE[entity](Admin(conn, session), data)}


def admin_close(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    entity = args["entity"]
    if entity not in CLOSE:
        raise ActionError(f"Không ngừng được loại dữ liệu {entity}")
    end = _date(args.get("end_date"), "Ngày kết thúc")
    return {"entity": entity, "id": CLOSE[entity](Admin(conn, session), args["id"], end)}


def adopt_proposed_partner(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    a = Admin(conn, session)
    a.one(
        "SELECT 1 FROM proc.purchase_request WHERE id = %s AND tenant_id = %s",
        (args["request_id"], a.tenant),
        "Không tìm thấy đề nghị",
    )
    partner = conn.execute(
        "SELECT mdm.adopt_proposed_partner(%s, %s, %s)", (args["request_id"], a.person, args.get("code") or "")
    ).fetchone()[0]
    return {"entity": "partner", "id": str(partner)}


def proposed_partners(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> list[dict]:
    a = Admin(conn, session)
    a.require(MDM)
    rows = conn.execute(
        """SELECT r.id, r.doc_no, r.title, r.status, r.proposed_partner_name, r.proposed_partner_tax_code,
                  p.full_name, to_char(r.created_at AT TIME ZONE %s, 'DD-Mon-YYYY')
           FROM proc.purchase_request r JOIN core.person p ON p.id = r.requester_id
           WHERE r.tenant_id = %s AND r.proposed_partner_name IS NOT NULL
           ORDER BY r.created_at DESC LIMIT 200""",
        (TZ, a.tenant),
    ).fetchall()
    keys = ("request_id", "doc_no", "title", "status", "name", "tax_code", "requester", "created_on")
    return [{**dict(zip(keys, r, strict=True)), "request_id": str(r[0])} for r in rows]


def create_person_accounts(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> list[dict]:
    a = Admin(conn, session)
    a.require(ORG)
    if ctx.users is None:
        raise ActionError("Chưa cấu hình tạo tài khoản (client bms-provisioner)", "unavailable", 503)
    from . import hr_account

    results = []
    for entry in args.get("accounts") or []:
        person_id, username = entry["person_id"], (entry.get("username") or "").strip().lower()
        email = (entry.get("email") or "").strip() or None
        result = {"person_id": person_id, "username": username, "temporary_password": None, "error": None}
        try:
            row = a.one(
                "SELECT full_name, idp_subject FROM core.person WHERE id = %s AND tenant_id = %s",
                (person_id, a.tenant),
                "Không tìm thấy người",
            )
            if row[1]:
                raise ActionError("Người này đã có tài khoản")
            if not username:
                raise ActionError("Thiếu tên đăng nhập")
            with conn.transaction():
                if entry.get("link_existing"):
                    existing = ctx.users.find(username)
                    if existing is None:
                        raise ActionError(f"Không có tài khoản {username}")
                    subject = existing["id"]
                else:
                    password = hr_account.temporary_password()
                    subject = ctx.users.create(
                        str(person_id), username, row[0], email, password, attribute="bamboo_person"
                    )
                    result["temporary_password"] = password
                conn.execute("UPDATE core.person SET idp_subject = %s WHERE id = %s", (subject, person_id))
        except hr_account.AccountConflict as exc:
            result["error"] = str(exc)
        except ActionError as exc:
            result["error"] = exc.message
        except psycopg.Error as exc:
            result["error"] = exc.diag.message_primary or str(exc)
        except Exception as exc:  # noqa: BLE001
            log.warning("tạo tài khoản %s lỗi: %s", username, exc)
            result["error"] = "Không kết nối được máy chủ đăng nhập, thử lại sau"
        if result["error"]:
            result["temporary_password"] = None
        results.append(result)
    return results


PERSON_TRACES = {
    "ic.ic_order": "đơn hàng nội bộ",
    "proc.purchase_request": "đề nghị mua sắm",
    "proc.purchase_order": "đơn mua",
    "wf.approval_step": "bước duyệt",
    "wf.task": "việc cần duyệt",
    "wf.approval_history": "lịch sử duyệt",
    "collab.notification": "thông báo",
    "collab.comment": "trao đổi",
    "collab.kb_document": "đề xuất tài liệu",
    "core.attachment": "tệp đính kèm",
    "hr.onboarding_request": "hồ sơ tiếp nhận nhân sự",
    "hr.private_access": "lượt xem dữ liệu cá nhân",
    "iot.incident": "sự cố thiết bị",
    "meta.data_issue": "báo lỗi dữ liệu",
}
UNTRACKED_TRACES = (
    ("audit.log", "actor_id", "nhật ký kiểm toán"),
    ("audit.archive_access", "person_id", "lượt xem kho lưu trữ"),
    ("audit.ledger_check", "checked_by", "lượt đối soát nhật ký"),
    ("wf.process_model", "created_by", "thiết kế quy trình"),
    ("wf.process_model", "updated_by", "thiết kế quy trình"),
    ("wf.process_version", "published_by", "phiên bản quy trình"),
    ("wf.sandbox_run", "started_by", "lượt chạy thử quy trình"),
)


def _refuse_delete(what: str) -> ActionError:
    return ActionError(
        f"Người này đã có {what} nên không xóa hẳn được (cần giữ cho lịch sử); kết thúc bổ nhiệm để ngừng hoạt động"
    )


def delete_person(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    a = Admin(conn, session)
    a.require(ORG)
    person_id = args["id"]
    subject = a.one(
        "SELECT idp_subject FROM core.person WHERE id = %s AND tenant_id = %s FOR UPDATE",
        (person_id, a.tenant),
        "Không tìm thấy người",
    )[0]
    if str(person_id) == str(a.person):
        raise ActionError("Không tự xóa chính mình được")
    if conn.execute(
        """SELECT 1 FROM core.assignment
           WHERE person_id = %s AND (upper_inf(valid_period) OR upper(valid_period) > now()) LIMIT 1""",
        (person_id,),
    ).fetchone():
        raise ActionError("Người này còn giữ vị trí: kết thúc bổ nhiệm trước")
    for table, column, what in UNTRACKED_TRACES:
        if conn.execute(
            f"SELECT 1 FROM {table} WHERE tenant_id = %s AND {column} = %s LIMIT 1", (a.tenant, person_id)
        ).fetchone():
            raise _refuse_delete(what)
    try:
        with conn.transaction():
            for table, where in (
                ("core.assignment", "person_id = %(p)s"),
                ("core.role_grant", "person_id = %(p)s"),
                ("core.team_member", "person_id = %(p)s"),
                ("core.delegation", "delegator_id = %(p)s OR delegate_id = %(p)s"),
            ):
                conn.execute(
                    f"DELETE FROM {table} WHERE tenant_id = %(t)s AND ({where})", {"t": a.tenant, "p": person_id}
                )
            conn.execute("DELETE FROM core.person WHERE id = %s", (person_id,))
    except psycopg.errors.ForeignKeyViolation as exc:
        table = f"{exc.diag.schema_name}.{exc.diag.table_name}"
        raise _refuse_delete(PERSON_TRACES.get(table, "dữ liệu nghiệp vụ")) from exc

    account = "none"
    if subject:
        account = "kept"
        if not conn.execute("SELECT 1 FROM core.person WHERE idp_subject = %s LIMIT 1", (subject,)).fetchone():
            if ctx.users is None:
                raise ActionError("Chưa cấu hình máy chủ đăng nhập (client bms-provisioner)", "unavailable", 503)
            try:
                ctx.users.disable(subject)
            except Exception as exc:  # noqa: BLE001
                log.warning("vô hiệu hóa tài khoản %s lỗi: %s", subject, exc)
                raise ActionError("Không kết nối được máy chủ đăng nhập, thử lại sau", "unavailable", 503) from exc
            account = "disabled"
    log.info("đã xóa người %s (tài khoản: %s)", person_id, account)
    return {"entity": "person", "id": str(person_id), "account": account}


COLUMNS: dict[str, list[tuple[str, str, bool, str]]] = {
    "org_unit": [
        ("code", "Mã đơn vị", True, "PHONG_KT"),
        ("name", "Tên đơn vị", True, "Phòng Kỹ thuật"),
        ("parent_code", "Mã đơn vị cha", True, "CTY_A"),
        ("unit_type_code", "Mã loại đơn vị", True, "PHONG"),
        ("is_legal_entity", "Là pháp nhân (Có/Không)", False, "Không"),
        ("province", "Tỉnh / thành của cơ sở", False, "Bắc Ninh"),
        ("lat", "Vĩ độ", False, "21.18612"),
        ("lng", "Kinh độ", False, "106.07631"),
    ],
    "position": [
        ("unit_code", "Mã đơn vị", True, "PHONG_KT"),
        ("name", "Tên vị trí", True, "Trưởng phòng"),
        ("job_title_code", "Mã chức danh", False, "TRUONG_PHONG"),
        ("is_head", "Là trưởng đơn vị (Có/Không)", False, "Có"),
        ("reports_to", "Báo cáo cho (MÃ_ĐƠN_VỊ/Tên vị trí)", False, ""),
    ],
    "person": [
        ("employee_code", "Mã nhân viên", True, "NV0001"),
        ("full_name", "Họ tên", True, "Nguyễn Văn An"),
        ("position", "Vị trí (MÃ_ĐƠN_VỊ/Tên vị trí)", False, "PHONG_KT/Trưởng phòng"),
        ("assignment_type", "Loại bổ nhiệm (Giữ chính/Kiêm nhiệm/Quyền/Hợp đồng)", False, "Giữ chính"),
        ("valid_from", "Từ ngày (dd-mmm-yyyy)", False, ""),
        ("valid_to", "Đến ngày (dd-mmm-yyyy)", False, ""),
        ("contract_no", "Số hợp đồng", False, ""),
        ("username", "Tên đăng nhập", False, "an.nv"),
        ("email", "Email", False, "an.nv@congty.vn"),
    ],
    "role_grant": [
        ("role_code", "Mã vai trò", True, "QUAN_LY"),
        ("position", "Vị trí (MÃ_ĐƠN_VỊ/Tên vị trí)", False, "PHONG_KT/Trưởng phòng"),
        ("unit_code", "Hoặc mã đơn vị (cả đơn vị nhận)", False, ""),
        ("scope", "Phạm vi (Cả tenant/Nhánh/Đơn vị)", False, "Nhánh"),
        ("scope_unit_code", "Mã đơn vị neo phạm vi", False, ""),
        ("valid_from", "Từ ngày (dd-mmm-yyyy)", False, ""),
        ("valid_to", "Đến ngày (dd-mmm-yyyy)", False, ""),
    ],
    "catalog_item": [
        ("catalog", "Danh mục (UNIT_TYPE/JOB_TITLE/ITEM_CATEGORY)", True, "JOB_TITLE"),
        ("code", "Mã", True, "TRUONG_PHONG"),
        ("name", "Tên", True, "Trưởng phòng"),
    ],
    "partner": [
        ("code", "Mã nhà cung cấp", True, "NCC001"),
        ("name", "Tên nhà cung cấp", True, "Công ty TNHH B"),
        ("tax_code", "Mã số thuế", False, "0101234567"),
        ("address", "Địa chỉ", False, ""),
        ("email", "Email", False, ""),
        ("phone", "Điện thoại", False, ""),
        ("internal_unit_code", "Mã đơn vị nội bộ (nếu là công ty trong tập đoàn)", False, ""),
    ],
    "item": [
        ("code", "Mã vật tư", True, "VT001"),
        ("name", "Tên vật tư", True, "Tụ điện 10uF"),
        ("uom", "Đơn vị tính", True, "cái"),
        ("category_code", "Nhóm vật tư", False, ""),
        ("ref_price", "Giá tham khảo", False, "1500"),
    ],
}
TITLES = {
    "org_unit": "don-vi",
    "position": "vi-tri",
    "person": "nhan-su",
    "role_grant": "cap-quyen",
    "catalog_item": "danh-muc",
    "partner": "nha-cung-cap",
    "item": "vat-tu",
}
EXAMPLE_WORDS = {"Có", "Không", "Giữ chính", "Nhánh"}
MAX_IMPORT_BYTES = 2 * 1024 * 1024
MAX_IMPORT_ROWS = 5000


def _fold(text) -> str:
    return " ".join(str(text or "").strip().lower().split()).removesuffix(" *").rstrip()


def _cell(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def _read_rows(kind: str, file_name: str, content: bytes) -> list[dict]:
    if file_name.lower().endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook

        try:
            sheet = load_workbook(io.BytesIO(content), read_only=True, data_only=True).worksheets[0]
        except Exception as exc:  # noqa: BLE001
            raise ActionError("Không đọc được tệp Excel") from exc
        table = [["" if v is None else _cell(v) for v in row] for row in sheet.iter_rows(values_only=True)]
    elif file_name.lower().endswith((".csv", ".txt")):
        text = content.decode("utf-8-sig", errors="replace")
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        table = list(csv.reader(io.StringIO(text), dialect))
    else:
        raise ActionError("Chỉ nhận tệp .xlsx hoặc .csv")
    if not table:
        raise ActionError("Tệp trống")
    header = {}
    for col in COLUMNS[kind]:
        for title in (col[0], col[1], col[1].replace("dd-mmm-yyyy", "dd/mm/yyyy"), i18n.english(col[1])):
            header[_fold(title)] = col[0]
    keys = [header.get(_fold(h)) for h in table[0]]
    missing = [i18n.t(title) for key, title, required, _ in COLUMNS[kind] if required and key not in keys]
    if missing:
        raise ActionError(f"Thiếu cột: {', '.join(missing)} (dùng tệp mẫu)")
    rows = []
    for values in table[1:]:
        if all(str(v).strip() == "" for v in values):
            continue
        rows.append({k: v for k, v in zip(keys, values, strict=False) if k})
    if len(rows) > MAX_IMPORT_ROWS:
        raise ActionError(f"Tối đa {MAX_IMPORT_ROWS} dòng mỗi lần nhập")
    return rows


def _order_units(rows: list[tuple[int, dict]]) -> list[tuple[int, dict]]:
    by_code = {str(r.get("code") or "").strip(): (n, r) for n, r in rows}
    done: set[str] = set()
    ordered: list[tuple[int, dict]] = []

    def visit(code: str, trail: set[str]) -> None:
        if code in done or code not in by_code or code in trail:
            return
        parent = str(by_code[code][1].get("parent_code") or "").strip()
        visit(parent, trail | {code})
        done.add(code)
        ordered.append(by_code[code])

    for _n, r in rows:
        visit(str(r.get("code") or "").strip(), set())
    seen = {n for n, _ in ordered}
    return ordered + [(n, r) for n, r in rows if n not in seen]


def _import_person(a: Admin, row: dict) -> str:
    person_id = save_person(a, row)
    if row.get("position"):
        held = a.conn.execute(
            f"""SELECT 1 FROM core.assignment x WHERE x.person_id = %s AND x.position_id = ANY(%s)
                  AND {HELD_FROM_NOW}""",
            (person_id, _position_candidates(a, str(row["position"]))),
        ).fetchone()
        if not held:
            save_assignment(a, {**row, "person_id": person_id})
    return person_id


CONSTRAINT_MESSAGES = {
    "assignment_one_primary_per_person": "Người này đã giữ chính một vị trí khác trong thời gian này: "
    "kết thúc bổ nhiệm cũ trước, hoặc chọn loại Kiêm nhiệm",
    "assignment_one_occupant_per_position": "Vị trí đã có người giữ trong thời gian này",
    "position_one_head_per_unit": "Đơn vị đã có vị trí trưởng",
}


def _db_message(exc: psycopg.Error) -> str:
    known = CONSTRAINT_MESSAGES.get(exc.diag.constraint_name or "")
    return known or exc.diag.message_primary or str(exc)


def _has_account(conn: psycopg.Connection, person_id) -> bool:
    row = conn.execute("SELECT idp_subject FROM core.person WHERE id = %s", (person_id,)).fetchone()
    return bool(row and row[0])


def admin_import(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    kind = args["kind"]
    if kind not in COLUMNS:
        raise ActionError(f"Không nhập được loại dữ liệu {kind}")
    try:
        content = base64.b64decode(args["content_base64"], validate=True)
    except ValueError as exc:
        raise ActionError("Nội dung tệp không hợp lệ") from exc
    if len(content) > MAX_IMPORT_BYTES:
        raise ActionError("Tệp tối đa 2 MB")
    rows = list(enumerate(_read_rows(kind, args["file_name"], content), start=2))
    dry_run = bool(args.get("dry_run", True))
    a = Admin(conn, session)
    handler = _import_person if kind == "person" else SAVE[kind]
    if kind == "org_unit":
        rows = _order_units(rows)
    errors: list[dict] = []
    created: list[dict] = []
    with conn.transaction() as tx:
        for line, row in rows:
            try:
                with conn.transaction():
                    row_id = handler(a, row)
                if kind == "person" and row.get("username") and not _has_account(conn, row_id):
                    created.append(
                        {
                            "row": line,
                            "person_id": row_id,
                            "username": str(row["username"]).strip(),
                            "full_name": str(row.get("full_name") or "").strip(),
                            "email": str(row.get("email") or "").strip() or None,
                        }
                    )
            except ActionError as exc:
                errors.append({"row": line, "message": exc.message})
            except psycopg.Error as exc:
                errors.append({"row": line, "message": _db_message(exc)})
        applied = not dry_run and not errors
        if not applied:
            raise Rollback(tx)
    errors.sort(key=lambda e: e["row"])
    return {
        "kind": kind,
        "total": len(rows),
        "valid": len(rows) - len(errors),
        "applied": applied,
        "dry_run": dry_run,
        "errors": errors,
        "created": created if applied else [],
    }


def admin_import_template(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    kind = args["kind"]
    if kind not in COLUMNS:
        raise ActionError(f"Không có mẫu cho {kind}")
    Admin(conn, session)
    i18n.for_session(conn, session)
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    data = wb.active
    data.title = i18n.t("Dữ liệu")
    example = wb.create_sheet(i18n.t("Ví dụ"))
    header = [i18n.t(title) + (" *" if required else "") for _, title, required, _ in COLUMNS[kind]]
    data.append(header)
    example.append(header)
    example.append([i18n.t(value) if value in EXAMPLE_WORDS else value for *_, value in COLUMNS[kind]])
    example.append([])
    example.append([i18n.t("Cột có dấu * là bắt buộc. Điền dữ liệu ở trang “Dữ liệu”; trang này không được nhập.")])
    for ws in (data, example):
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="2F7A3E")
        for i, title in enumerate(header, start=1):
            ws.column_dimensions[ws.cell(1, i).column_letter].width = max(14, min(42, len(title) + 4))
        ws.freeze_panes = "A2"
    out = io.BytesIO()
    wb.save(out)
    return {"file_name": f"mau-{TITLES[kind]}.xlsx", "content_base64": base64.b64encode(out.getvalue()).decode()}


HANDLERS = {
    "admin_save": admin_save,
    "admin_close": admin_close,
    "create_person_accounts": create_person_accounts,
    "delete_person": delete_person,
    "admin_import": admin_import,
    "admin_import_template": admin_import_template,
    "adopt_proposed_partner": adopt_proposed_partner,
    "proposed_partners": proposed_partners,
}
