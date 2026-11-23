# Bamboo - DX-OS Open-Core
# @version 0.5.2
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

import psycopg
import pytest
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from test_giao_thong_bao import FakeGateway

from app import anchoring, config, receipts
from app.common import ActionError, Context
from app.main import run_action
from conftest import SETTINGS, drop_role, ids, pr


@pytest.fixture
def cur(database):
    with psycopg.connect(database, row_factory=dict_row, autocommit=True) as c:
        yield c


def settings_for(database, **extra):
    return config.Settings(**{**SETTINGS.__dict__, "database_url": database, **extra})


def test_neo_ky_cong_bo_va_phat_hien_viet_lai(cur, database, s3):
    i = ids(cur, "TDX", "c")
    signer = receipts.Signer.from_env(SETTINGS.actions_secret, "anchor")
    settings = settings_for(database)
    pr(cur, "neo_1", "c", "P_NV_MH_DT", 10_000_000)

    first = anchoring.anchor_tenant(cur, signer, settings, s3, i["TDX"])
    assert first and first["published"][0] == {
        "kind": "s3",
        "key": anchoring.object_key(i["TDX"], first["seq"]),
        "ok": True,
    }
    assert anchoring.anchor_tenant(cur, signer, settings, s3, i["TDX"]) is None, "không có gì mới thì không neo lại"
    stored = json.loads(s3.read_stored(anchoring.object_key(i["TDX"], first["seq"])))
    assert json.loads(stored["statement"])["head"] == first["head"] and stored["signature"]["alg"] in (
        "ed25519",
        "hmac-sha256",
    )

    pr(cur, "neo_2", "c", "P_NV_MH_DT", 20_000_000)
    second = anchoring.anchor_tenant(cur, signer, settings, s3, i["TDX"])
    assert second["seq"] > first["seq"]
    assert (
        anchoring.verify_tenant(cur, signer, s3, i["TDX"]) == {"ok": True, "checked": 2, "problems": []}
        or (anchoring.verify_tenant(cur, signer, s3, i["TDX"])["ok"])
    )

    s3.put_document(
        anchoring.object_key(i["TDX"], first["seq"]), b'{"statement": "x", "signature": {}}', "application/json"
    )
    problems = {p["problem"] for p in anchoring.verify_tenant(cur, signer, s3, i["TDX"])["problems"]}
    assert "PUBLICATION_DIFFERS" in problems
    s3.put_document(
        anchoring.object_key(i["TDX"], first["seq"]),
        json.dumps(stored, ensure_ascii=False, sort_keys=True).encode(),
        "application/json",
    )
    assert anchoring.verify_tenant(cur, signer, s3, i["TDX"])["ok"]

    with psycopg.connect(database, row_factory=dict_row) as tx:
        tx.execute("ALTER TABLE audit.log DISABLE TRIGGER USER")
        tx.execute(
            "UPDATE audit.log SET hash = decode(repeat('ab', 32), 'hex') WHERE tenant_id = %s AND seq = %s",
            (i["TDX"], first["seq"]),
        )
        result = anchoring.verify_tenant(tx, signer, s3, i["TDX"])
        assert not result["ok"] and {"seq": first["seq"], "problem": "LOG_REWRITTEN"} in result["problems"]
        tx.rollback()

    with psycopg.connect(database, row_factory=dict_row) as tx:
        tx.execute("ALTER TABLE audit.anchor DISABLE TRIGGER anchor_guard")
        forged = anchoring.statement_text(i["TDX"], second["seq"], "cd" * 32, "2026-01-01T00:00:00+00:00")
        tx.execute(
            "UPDATE audit.anchor SET statement = %s, head_hash = decode(%s, 'hex') WHERE tenant_id = %s AND seq = %s",
            (forged, "cd" * 32, i["TDX"], second["seq"]),
        )
        problems = {p["problem"] for p in anchoring.verify_tenant(tx, signer, s3, i["TDX"])["problems"]}
        assert "BAD_SIGNATURE" in problems
        tx.rollback()
    assert anchoring.verify_tenant(cur, signer, s3, i["TDX"])["ok"], "dữ liệu thật không bị ảnh hưởng"


def test_cong_bo_ra_diem_ngoai_va_thu_lai(cur, database, s3):
    i = ids(cur, "TDX", "c")
    signer = receipts.Signer.from_env(SETTINGS.actions_secret, "anchor")
    gateway = FakeGateway(status=503)
    try:
        settings = settings_for(database, anchor_url=gateway.url)
        pr(cur, "neo_ngoai", "c", "P_NV_MH_DT", 10_000_000)
        anchored = anchoring.anchor_tenant(cur, signer, settings, s3, i["TDX"])
        assert {"kind": "http", "ok": False, "status": 503} in anchored["published"]
        gateway.status = 200
        assert anchoring.retry_publication(cur, settings, s3) >= 1
        row = cur.execute(
            "SELECT published FROM audit.anchor WHERE tenant_id = %s AND seq = %s", (i["TDX"], anchored["seq"])
        ).fetchone()
        assert all(p["ok"] for p in row["published"]), row
        assert gateway.requests[-1]["body"]["statement"] and gateway.requests[-1]["body"]["signature"]
    finally:
        gateway.close()


def test_hanh_dong_can_quyen_audit_read(cur, database, s3):
    i = ids(cur, "TDX", "c", "tgd")
    signer = receipts.Signer.from_env(SETTINGS.actions_secret, "anchor")
    ctx = Context(storage=s3, anchor_signer=signer)
    employee = {"x-hasura-role": "user", "x-hasura-user-id": i["c"], "x-hasura-tenant-id": i["TDX"]}
    with psycopg.connect(database, autocommit=True) as conn:
        with pytest.raises(ActionError) as err:
            anchoring.audit_anchors(conn, employee, {}, ctx)
        assert err.value.status == 403
        try:
            cur.execute("INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'KT_NEO', 'Kiểm toán')")
            cur.execute(
                "INSERT INTO core.role_permission (tenant_id, role_id, permission_code) SELECT tenant_id, id, 'audit.read' FROM core.role WHERE code = 'KT_NEO'"
            )
            cur.execute(
                "INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope) SELECT test.id('TDX'), r.id, test.id('P_NV_MH_DT'), 'TENANT' FROM core.role r WHERE r.code = 'KT_NEO'"
            )
            pr(cur, "neo_hd", "c", "P_NV_MH_DT", 10_000_000)
            pool = ConnectionPool(database, min_size=1, max_size=2, open=True)
            try:
                assert run_action(pool, "audit_anchor_now", {"session_variables": employee}, ctx)["anchored"] is True
            finally:
                pool.close()
            listing = anchoring.audit_anchors(conn, employee, {}, ctx)
            assert (
                listing["anchors"]
                and listing["anchors"][0]["head_hash"]
                and listing["head_seq"] >= listing["anchors"][0]["seq"]
            )
            assert anchoring.audit_anchor_verify(conn, employee, {}, ctx)["ok"] is True

        finally:
            drop_role(cur, "KT_NEO")
