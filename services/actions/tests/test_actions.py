# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Hasura Actions gọi thẳng (không qua Hasura): kiểm tra phiên, tenant, lỗi nghiệp vụ."""

import pytest
from fastapi.testclient import TestClient

from app import config, main
from conftest import SETTINGS, ids, open_task, pr, status


@pytest.fixture
def client(database):
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": database})
    with TestClient(main.create_app(settings)) as c:
        yield c


def call(client, name, args, person, tenant, secret=SETTINGS.actions_secret):
    payload = {"action": {"name": name}, "input": args,
               "session_variables": {"x-hasura-role": "user", "x-hasura-user-id": person,
                                     "x-hasura-tenant-id": tenant}}
    return client.post(f"/actions/{name}", json=payload, headers={"x-actions-secret": secret})


def test_sai_ma_bi_mat(client, conn, org):
    k = org
    i = ids(conn, "TDX", k("nv"))
    resp = call(client, "submit_purchase_request", {"request_id": "00000000-0000-0000-0000-000000000000"},
                i[k("nv")], i["TDX"], secret="sai")
    assert resp.status_code == 401


def test_gui_duyet_va_duyet(client, conn, org):
    k = org
    i = ids(conn, "TDX", k("nv"), k("tp"))
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 20_000_000, submit=False)

    resp = call(client, "submit_purchase_request", {"request_id": pr_id}, i[k("tp")], i["TDX"])
    assert resp.status_code == 400
    assert "Chỉ người lập" in resp.json()["message"]

    resp = call(client, "submit_purchase_request", {"request_id": pr_id}, i[k("nv")], i["TDX"])
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"request_id": pr_id, "status": "PENDING"}

    task = open_task(conn, pr_id)
    assert str(task["assignee_id"]) == i[k("tp")]
    resp = call(client, "act_on_task", {"task_id": str(task["id"]), "decision": "APPROVE"}, i[k("tp")], i["TDX"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "APPROVED"
    assert status(conn, pr_id) == "APPROVED"


def test_tu_choi_bat_buoc_ly_do(client, conn, org):
    k = org
    i = ids(conn, "TDX", k("tp"))
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 20_000_000)
    task_id = str(open_task(conn, pr_id)["id"])
    resp = call(client, "act_on_task", {"task_id": task_id, "decision": "REJECT"}, i[k("tp")], i["TDX"])
    assert resp.status_code == 400
    assert resp.json()["extensions"]["code"] == "note-required"
    resp = call(client, "act_on_task", {"task_id": task_id, "decision": "RETURN", "note": "Thiếu báo giá"},
                i[k("tp")], i["TDX"])
    assert resp.json()["status"] == "RETURNED"


def test_khac_tenant_khong_thay_chung_tu(client, conn, org):
    k = org
    i = ids(conn, "BVX", k("nv"))
    pr_id = pr(conn, k("pr"), k("nv"), k("P_NV"), 20_000_000, submit=False)
    resp = call(client, "submit_purchase_request", {"request_id": pr_id}, i[k("nv")], i["BVX"])
    assert resp.status_code == 404


def test_ma_khong_hop_le(client, conn, org):
    k = org
    i = ids(conn, "TDX", k("nv"))
    resp = call(client, "submit_purchase_request", {"request_id": "khong-phai-uuid"}, i[k("nv")], i["TDX"])
    assert resp.status_code == 400
