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

"""Cổng dịch vụ API (ADR #64): khóa của công ty, phạm vi, hạn dùng, dải IP, thu hồi, đếm lượt gọi."""

import uuid

import httpx
import pytest

from app import api_gateway
from app.common import ActionError
from conftest import SETTINGS, ids


@pytest.fixture
def admin(conn, org):
    """Giám đốc của cây đơn vị thử là quản trị viên công ty (core.org.manage); nhân viên thì không."""
    role = f"QT_{uuid.uuid4().hex[:8]}"
    params = {"r": role, "p": org("P_GD")}
    conn.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %(r)s, 'Quản trị')", params)
    conn.execute(
        """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
           SELECT tenant_id, id, 'core.org.manage' FROM core.role WHERE tenant_id = test.id('TDX') AND code = %(r)s""",
        params,
    )
    conn.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
           SELECT test.id('TDX'), id, test.id(%(p)s), 'TENANT' FROM core.role
           WHERE tenant_id = test.id('TDX') AND code = %(r)s""",
        params,
    )
    i = ids(conn, org("gd"), org("nv"), "TDX")
    return {"gd": i[org("gd")], "nv": i[org("nv")], "TDX": i["TDX"]}


def action(base, name, args, person, tenant):
    payload = {
        "action": {"name": name},
        "input": args,
        "session_variables": {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant},
    }
    return httpx.post(
        f"{base}/actions/{name}", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret}, timeout=30
    )


def get(base, path, key=None, ip=None):
    headers = {"authorization": f"Bearer {key}"} if key else {}
    if ip:
        headers["x-forwarded-for"] = f"10.9.9.9, {ip}"
    return httpx.get(f"{base}{path}", headers=headers, timeout=30)


def test_khoa_moi_dung_dinh_dang_va_chi_luu_bam():
    key = api_gateway.new_key()
    assert key.startswith("bak_") and len(key) == 47
    assert api_gateway.digest(key) != api_gateway.digest(api_gateway.new_key())
    assert api_gateway.parse_ips(["10.0.0.0/8", "192.168.1.5"]) == ["10.0.0.0/8", "192.168.1.5/32"]
    with pytest.raises(ActionError):
        api_gateway.parse_ips(["không-phải-ip"])


def test_openapi_sinh_tu_danh_muc_endpoint():
    spec = api_gateway.openapi()
    assert set(spec["paths"]) == {e.path for e in api_gateway.ENDPOINTS}
    assert spec["paths"]["/api/v1/metrics/query"]["post"]["requestBody"]["required"] is True
    [param] = spec["paths"]["/api/v1/datasets/{dataset}"]["get"]["parameters"]
    assert param == {**param, "in": "path", "required": True}
    assert {e.scope for e in api_gateway.ENDPOINTS} <= set(api_gateway.SCOPES)


def test_vong_doi_khoa_pham_vi_ip_thu_hoi(actions_server, admin, conn):
    gd, nv, tdx = admin["gd"], admin["nv"], admin["TDX"]
    args = {"name": "Kho dữ liệu BI", "scopes": ["org.read", "lineage.read"], "expires_days": 30}
    denied = action(actions_server, "api_key_create", args, nv, tdx)
    assert denied.status_code == 403 and denied.json()["extensions"]["code"] == "forbidden", "nhân viên không tạo khóa"

    bad = action(actions_server, "api_key_create", {**args, "scopes": ["admin.all"]}, gd, tdx)
    assert bad.json()["extensions"]["code"] == "bad-request"
    long = action(actions_server, "api_key_create", {**args, "expires_days": 400}, gd, tdx)
    assert long.json()["extensions"]["code"] == "bad-request", "hạn dùng tối đa một năm"

    created = action(actions_server, "api_key_create", args, gd, tdx).json()
    key = created["key"]
    stored = conn.execute("SELECT * FROM api.api_key WHERE id = %s", (created["id"],)).fetchone()
    assert stored["prefix"] == key[:10] and bytes(stored["key_sha256"]) == api_gateway.digest(key)
    assert key not in str(dict(stored)), "máy chủ không giữ khóa gốc"

    assert get(actions_server, "/api/v1/org-units").status_code == 401
    assert get(actions_server, "/api/v1/org-units", "bak_sai").status_code == 401
    units = get(actions_server, "/api/v1/org-units", key)
    assert units.status_code == 200 and all("name" in u for u in units.json()) and units.json()
    graph = get(actions_server, "/api/v1/lineage", key)
    assert graph.status_code == 200 and set(graph.json()) == {"nodes", "edges", "checks", "runs"}
    scope = get(actions_server, "/api/v1/datasets", key)
    assert scope.status_code == 403 and "datasets.read" in scope.json()["message"]

    usage = conn.execute("SELECT calls, errors FROM api.usage WHERE key_id = %s", (created["id"],)).fetchone()
    assert (usage["calls"], usage["errors"]) == (2, 0), "lượt bị từ chối vì phạm vi không chạy Action"
    used = conn.execute(
        "SELECT api.api_key_last_used_at(k) AS at FROM api.api_key k WHERE id = %s", (created["id"],)
    ).fetchone()
    assert used["at"], "lần dùng cuối ghi ở dòng đếm theo ngày"
    assert not conn.execute(
        "SELECT 1 FROM audit.log WHERE table_name = 'api.api_key' AND op = 'UPDATE' AND row_id::text LIKE '%%' || %s || '%%'",
        (created["id"],),
    ).fetchone(), "gọi API không sinh nhật ký kiểm toán"

    fenced = action(
        actions_server, "api_key_create", {**args, "name": "Chỉ mạng nội bộ", "allowed_ips": ["10.1.0.0/16"]}, gd, tdx
    ).json()["key"]
    assert get(actions_server, "/api/v1/org-units", fenced, ip="203.0.113.7").status_code == 403
    assert get(actions_server, "/api/v1/org-units", fenced, ip="10.1.2.3").status_code == 200

    assert action(actions_server, "api_key_revoke", {"id": created["id"]}, nv, tdx).json()["extensions"]["code"] == (
        "forbidden"
    )
    assert action(actions_server, "api_key_revoke", {"id": created["id"]}, gd, tdx).json()["revoked"] is True
    assert get(actions_server, "/api/v1/org-units", key).status_code == 401, "thu hồi có hiệu lực ngay"

    conn.execute(
        "UPDATE api.api_key SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second' "
        "WHERE key_sha256 = %s",
        (api_gateway.digest(fenced),),
    )
    assert get(actions_server, "/api/v1/org-units", fenced, ip="10.1.2.3").status_code == 401, "khóa hết hạn"


def test_khoa_goi_thay_nguoi_tao_va_loi_action_van_dem(actions_server, admin, conn):
    gd, tdx = admin["gd"], admin["TDX"]
    key = action(
        actions_server, "api_key_create", {"name": "Chỉ số", "scopes": ["metrics.read"], "expires_days": 7}, gd, tdx
    ).json()["key"]
    r = httpx.post(
        f"{actions_server}/api/v1/metrics/query",
        json={"metrics": ["request_count"], "sql": "DROP TABLE x"},
        headers={"authorization": f"Bearer {key}"},
        timeout=30,
    )
    assert r.status_code == 403 and r.json()["code"] == "forbidden"
    row = conn.execute(
        "SELECT u.calls, u.errors FROM api.usage u JOIN api.api_key k ON k.id = u.key_id WHERE k.key_sha256 = %s",
        (api_gateway.digest(key),),
    ).fetchone()
    assert (row["calls"], row["errors"]) == (1, 1)
    assert httpx.get(f"{actions_server}/api/v1/openapi.json", timeout=10).json()["openapi"] == "3.1.0"
