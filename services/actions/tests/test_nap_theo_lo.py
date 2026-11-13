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

import json
import time
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from app import config, main
from app.common import Context
from conftest import SETTINGS, ids


class FakeVerifier:
    def verify(self, token: str) -> dict:
        if token == "hong":
            from app import auth

            raise auth.AuthError("Token không hợp lệ")
        return {"sub": token, "exp": time.time() + 600}


@pytest.fixture
def cur(database):
    with psycopg.connect(database, row_factory=dict_row, autocommit=True) as c:
        yield c


@pytest.fixture
def client(database, cur):
    cur.execute(
        "INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), %s, 'Nạp lô')",
        (f"NAP_{uuid.uuid4().hex[:6]}",),
    )
    cur.execute(
        """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
           SELECT tenant_id, id, p FROM core.role, unnest(ARRAY['core.org.manage', 'mdm.manage']) p
           WHERE code LIKE 'NAP_%' AND tenant_id = test.id('TDX') ON CONFLICT DO NOTHING"""
    )
    cur.execute(
        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
           SELECT test.id('TDX'), r.id, test.id('P_TGD'), 'TENANT' FROM core.role r WHERE r.code LIKE 'NAP_%'
           AND r.tenant_id = test.id('TDX') AND NOT EXISTS (SELECT 1 FROM core.role_grant g WHERE g.role_id = r.id)"""
    )
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database, "obs_enabled": False})
    with TestClient(main.create_app(settings, verifier=FakeVerifier(), ctx=Context())) as c:
        yield c


def post(client, kind, body, *, key=None, user="tgd", tenant=None, params=None, ctype="application/x-ndjson"):
    headers = {"authorization": f"Bearer {user}", "content-type": ctype, "idempotency-key": key or uuid.uuid4().hex}
    if tenant:
        headers["x-bamboo-tenant"] = tenant
    return client.post(f"/ingest/{kind}", content=body.encode(), headers=headers, params=params or {})


def lines(*records) -> str:
    return "\n".join(json.dumps(r, ensure_ascii=False) for r in records) + "\n"


def test_nap_ndjson_tung_lo_ghi_loi_tung_dong(client, cur):
    tdx = ids(cur, "TDX")["TDX"]
    pfx = "NC" + uuid.uuid4().hex[:5].upper()
    body = (
        lines(
            {"code": f"{pfx}1", "name": "Nhà cung cấp 1", "tax_code": "0101234567"},
            {"code": f"{pfx}2", "name": "Nhà cung cấp 2"},
            {"Mã nhà cung cấp": f"{pfx}3", "Tên nhà cung cấp": "Dùng tiêu đề tiếng Việt"},
            {"code": f"{pfx}4"},
        )
        + "không phải json\n[1, 2]\n"
    )
    response = post(client, "partner", body, tenant=tdx)
    assert response.status_code == 200, response.text
    job = response.json()
    assert (job["status"], job["total"], job["accepted"], job["rejected"]) == ("PARTIAL", 6, 3, 3), job
    assert {e["row"] for e in job["errors"]} == {4, 5, 6} and any("JSON" in e["message"] for e in job["errors"])
    assert (
        cur.execute("SELECT count(*)::int AS n FROM mdm.partner WHERE code LIKE %s", (f"{pfx}%",)).fetchone()["n"] == 3
    )

    status = client.get(f"/ingest/jobs/{job['id']}", headers={"authorization": "Bearer tgd", "x-bamboo-tenant": tdx})
    assert status.status_code == 200 and status.json()["accepted"] == 3
    other = client.get(f"/ingest/jobs/{job['id']}", headers={"authorization": "Bearer ptgd", "x-bamboo-tenant": tdx})
    assert other.status_code == 404, "người khác không xem được công việc của bạn"


def test_khoa_chong_nap_trung_va_chay_thu(client, cur):
    tdx = ids(cur, "TDX")["TDX"]
    pfx = "VT" + uuid.uuid4().hex[:5].upper()
    body = lines(
        {"code": f"{pfx}1", "name": "Vật tư 1", "uom": "cái"}, {"code": f"{pfx}2", "name": "Vật tư 2", "uom": "cái"}
    )
    dry = post(client, "item", body, tenant=tdx, params={"dry_run": "true"}).json()
    assert dry["status"] == "VALIDATED" and dry["accepted"] == 2
    assert (
        cur.execute("SELECT count(*)::int AS n FROM mdm.item WHERE code LIKE %s", (f"{pfx}%",)).fetchone()["n"] == 0
    ), "chạy thử không ghi"

    key = "khoa-" + uuid.uuid4().hex
    first = post(client, "item", body, key=key, tenant=tdx).json()
    assert first["status"] == "DONE" and not first["idempotent_replay"]
    again = post(client, "item", body, key=key, tenant=tdx).json()
    assert again["idempotent_replay"] and again["id"] == first["id"]
    assert cur.execute("SELECT count(*)::int AS n FROM mdm.item WHERE code LIKE %s", (f"{pfx}%",)).fetchone()["n"] == 2
    changed = post(client, "item", body + lines({"code": f"{pfx}3", "name": "Thêm", "uom": "cái"}), key=key, tenant=tdx)
    assert changed.status_code == 409, "cùng khóa nhưng nội dung khác"
    assert post(client, "item", body, key="ngan", tenant=tdx).status_code == 400, "khóa quá ngắn"


def test_che_do_nguyen_tu_hoan_tac_het(client, cur):
    tdx = ids(cur, "TDX")["TDX"]
    pfx = "AT" + uuid.uuid4().hex[:5].upper()
    body = lines({"code": f"{pfx}1", "name": "Hợp lệ", "uom": "cái"}, {"code": f"{pfx}2", "name": "Thiếu đơn vị tính"})
    response = post(client, "item", body, tenant=tdx, params={"mode": "atomic"})
    job = response.json()
    assert response.status_code == 422 and job["status"] == "FAILED" and job["accepted"] == 0 and job["rejected"] == 1
    assert cur.execute("SELECT count(*)::int AS n FROM mdm.item WHERE code LIKE %s", (f"{pfx}%",)).fetchone()["n"] == 0
    ok = post(
        client,
        "item",
        lines({"code": f"{pfx}1", "name": "Hợp lệ", "uom": "cái"}),
        tenant=tdx,
        params={"mode": "atomic"},
    ).json()
    assert ok["status"] == "DONE" and ok["accepted"] == 1


def test_lo_lon_vuot_gioi_han_cu_cua_trang_nhap(client, cur):
    tdx = ids(cur, "TDX")["TDX"]
    pfx = "L" + uuid.uuid4().hex[:4].upper()
    body = lines(*[{"code": f"{pfx}{n:05d}", "name": f"Vật tư {n}", "uom": "cái"} for n in range(5600)])
    job = post(client, "item", body, tenant=tdx).json()
    assert job["status"] == "DONE" and job["accepted"] == 5600, "vượt 5000 dòng của trang nhập quản trị"
    assert (
        cur.execute("SELECT count(*)::int AS n FROM mdm.item WHERE code LIKE %s", (f"{pfx}%",)).fetchone()["n"] == 5600
    )


def test_csv_tieu_de_tieng_viet_va_thieu_cot(client, cur):
    tdx = ids(cur, "TDX")["TDX"]
    code = "DM" + uuid.uuid4().hex[:5].upper()
    csv_body = f"Danh mục (UNIT_TYPE/JOB_TITLE/ITEM_CATEGORY),Mã,Tên\nITEM_CATEGORY,{code},Nhóm thử nghiệm\n"
    job = post(client, "catalog_item", csv_body, tenant=tdx, ctype="text/csv").json()
    assert job["status"] == "DONE" and job["accepted"] == 1
    missing = post(client, "catalog_item", "Mã,Tên\nA,B\n", tenant=tdx, ctype="text/csv")
    assert missing.status_code == 400 and "Thiếu cột" in missing.json()["message"]
    assert post(client, "khong-co", "{}", tenant=tdx).status_code == 404


def test_xac_thuc_va_quyen(client, cur):
    tdx = ids(cur, "TDX")["TDX"]
    body = lines({"code": "X1", "name": "x", "uom": "cái"})
    assert client.post("/ingest/item", content=body, headers={"idempotency-key": "k" * 10}).status_code == 401
    assert post(client, "item", body, user="hong", tenant=tdx).status_code == 401
    assert post(client, "item", body, user="c", tenant=tdx).status_code in (401, 403), (
        "nhân viên thường không có quyền nạp"
    )
    assert post(client, "item", body, user="tgd").status_code == 400, "thiếu tenant"
