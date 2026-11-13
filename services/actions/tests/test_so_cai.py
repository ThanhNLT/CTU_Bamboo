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

import hashlib
import uuid

import httpx
import pytest
from test_tep_dinh_kem import CONFIRM, PDF, upload

from app import ledger
from conftest import ids, pr

VERIFY = """mutation($code: String, $sha: String, $file: String) {
  ledger_verify(code: $code, sha256: $sha, file_name: $file) {
    kind via query checked_at actual_sha256 problem
    seal { code version title file_name block tx_id sha256 channel last_result } } }"""
OVERVIEW = """query { ledger_overview { channel sealed sealed_this_week archived checked_today matched_today
  mismatched_today mismatch_30d chain_reader recent { code version sha256 last_result } } }"""
ARCHIVE = """query { ledger_archive { docs { attachment_id code title file_name restricted status }
  access { doc_title viewer opened_at } } }"""
OPEN = """mutation($a: uuid!) { ledger_open_archive(attachment_id: $a) { url viewer expires_in content_type } }"""


@pytest.mark.parametrize(
    ("text", "code", "version"),
    [
        ("PR-2026-000012", "PR-2026-000012", None),
        ("PR-2026-000012 v2", "PR-2026-000012", "2"),
        ("pr-2026-000012 · v3", "pr-2026-000012", "3"),
    ],
)
def test_doc_ma_ho_so(text, code, version):
    m = ledger.CODE.match(text)
    assert m and m.group(1) == code and m.group(2) == version


@pytest.fixture
def sealed(hasura, conn, s3):
    i = ids(conn, "TDX", "c", "a")
    pr_id = pr(conn, f"so_cai_{uuid.uuid4().hex[:8]}", "c", "P_NV_MH_DT", 10_000_000)
    att = upload(hasura, i, pr_id, PDF, name="bien-ban.pdf")
    assert hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]["status"] == "CLEAN"
    doc_no = conn.execute("SELECT doc_no FROM proc.purchase_request WHERE id = %s", (pr_id,)).fetchone()["doc_no"]
    return i, pr_id, doc_no, att, f"{i['TDX']}/proc.purchase_request/{pr_id}/{att}"


def verify(hasura, i, who="c", **variables):
    data = hasura(VERIFY, variables, person=i[who], tenant=i["TDX"])
    assert "errors" not in data, data
    return data["data"]["ledger_verify"]


def test_doi_soat_theo_ma_va_theo_tep(hasura, s3, sealed):
    i, _, doc_no, _, key = sealed
    digest = hashlib.sha256(s3.read_stored(key)).hexdigest()

    r = verify(hasura, i, code=doc_no)
    assert r["kind"] == "match" and r["actual_sha256"] == digest and r["problem"] is None, r
    seal = r["seal"]
    assert (seal["code"], seal["version"], seal["file_name"], seal["sha256"]) == (doc_no, 1, "bien-ban.pdf", digest)
    assert seal["block"] > 0 and len(seal["tx_id"]) == 64 and seal["channel"] == "TDX"

    assert verify(hasura, i, sha=digest, file="ban-sao.pdf")["kind"] == "match"
    assert verify(hasura, i, sha="0" * 64, file="khac.pdf")["kind"] == "not_found"
    assert verify(hasura, i, who="a", code=doc_no)["kind"] == "not_found"

    s3.put_document(key, b"%PDF-1.7 da bi sua", "application/pdf")
    r = verify(hasura, i, code=f"{doc_no} v1")
    assert r["kind"] == "mismatch" and r["actual_sha256"] == hashlib.sha256(b"%PDF-1.7 da bi sua").hexdigest(), r
    assert r["seal"]["sha256"] == digest

    s3.delete(key)
    r = verify(hasura, i, code=doc_no)
    assert r["kind"] == "mismatch" and r["problem"] == "Tệp không còn trong kho lưu trữ", r

    overview = hasura(OVERVIEW, person=i["c"], tenant=i["TDX"])["data"]["ledger_overview"]
    assert overview["sealed"] >= 1 and overview["checked_today"] >= 5 and overview["mismatched_today"] >= 2
    assert overview["chain_reader"] is False
    mine = next(s for s in overview["recent"] if s["code"] == doc_no)
    assert mine["last_result"] == "mismatch"


def test_dau_vao_sai(hasura, sealed):
    i, *_ = sealed
    data = hasura(VERIFY, {}, person=i["c"], tenant=i["TDX"])
    assert "chỉ một trong hai" in data["errors"][0]["message"]
    data = hasura(VERIFY, {"sha": "xyz"}, person=i["c"], tenant=i["TDX"])
    assert "64 ký tự" in data["errors"][0]["message"]


def test_phong_doc(hasura, conn, sealed):
    i, pr_id, doc_no, att, _ = sealed
    docs = hasura(ARCHIVE, person=i["c"], tenant=i["TDX"])["data"]["ledger_archive"]["docs"]
    assert att not in {d["attachment_id"] for d in docs}, "chứng từ chưa kết thúc chưa vào phòng đọc"
    data = hasura(OPEN, {"a": att}, person=i["c"], tenant=i["TDX"])
    assert data["errors"][0]["extensions"]["code"] == "not-found"

    cancel = """mutation($id: uuid!) { cancel_purchase_request(request_id: $id, reason: "Thử phòng đọc") { status } }"""
    assert hasura(cancel, {"id": pr_id}, person=i["c"], tenant=i["TDX"])["data"]["cancel_purchase_request"]
    archive = hasura(ARCHIVE, person=i["c"], tenant=i["TDX"])["data"]["ledger_archive"]
    doc = next(d for d in archive["docs"] if d["attachment_id"] == att)
    assert (doc["code"], doc["status"], doc["restricted"]) == (doc_no, "CANCELLED", False)

    view = hasura(OPEN, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["ledger_open_archive"]
    assert view["expires_in"] == 60 and view["content_type"] == "application/pdf"
    resp = httpx.get(view["url"])
    stored = conn.execute("SELECT sha256 FROM core.attachment WHERE id = %s", (att,)).fetchone()["sha256"]
    assert hashlib.sha256(resp.content).hexdigest() == stored and resp.headers["content-disposition"].startswith(
        "inline"
    )
    access = hasura(ARCHIVE, person=i["c"], tenant=i["TDX"])["data"]["ledger_archive"]["access"]
    assert access[0]["viewer"] == view["viewer"] and access[0]["doc_title"] == doc["title"]
    assert hasura(OPEN, {"a": att}, person=i["a"], tenant=i["TDX"])["errors"][0]["extensions"]["code"] == "not-found"
