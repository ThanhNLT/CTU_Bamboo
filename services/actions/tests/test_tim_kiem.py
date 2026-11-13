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

import io
import zipfile

import psycopg
import pytest
from psycopg.rows import dict_row
from test_tep_dinh_kem import CONFIRM, upload

from app import search, search_sync
from app.common import ActionError
from conftest import ids, pr

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
SEARCH = """query($q: String!, $kind: SearchKind) {
  search_documents(query: $q, kind: $kind) {
    kind entity_id attachment_id file_name matched_field snippet
    purchase_request { doc_no title } attachment { file_name } } }"""


def docx(text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        )
        z.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        )
        z.writestr(
            "word/document.xml",
            '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>",
        )
    return buf.getvalue()


def sync(settings) -> None:
    meili = search.Meili(settings.meili_url, settings.meili_indexer_key)
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        while search_sync.run_once(conn, meili, settings, limit=200):
            pass
        failed = conn.execute(
            "SELECT entity_type, entity_id, last_error FROM search.pending WHERE dirty AND last_error IS NOT NULL"
        ).fetchall()
    assert not failed, failed


def test_doan_trich_an_toan():
    field, snippet = search._snippet(
        {"_formatted": {"title": "Đề nghị", "content": "…<script>alert(1)</script> báo giá tụ điện gốm…"}}
    )
    assert field == "content"
    assert snippet == "…&lt;script&gt;alert(1)&lt;/script&gt; báo giá <mark>tụ điện</mark> gốm…"
    assert search._snippet({"_formatted": {"items": ["Tụ điện", "Điện trở"]}}) == (
        "items",
        "Tụ <mark>điện</mark>; Điện trở",
    )
    assert search._snippet({"_formatted": {"title": "A & B"}}) == ("title", "A &amp; B"), "không khớp thì lấy tiêu đề"


def test_khoa_suy_ra_tu_khoa_chu():
    assert (
        search.derive_key("dev-meili-master-key-0123456789", "6062abda-a5aa-4414-ac91-ecd7944c0f8d")
        == "adb6f2d0dfcee69cdad21fa1aba3f850feaa0340529677b849ab7dce1a93536c"
    )


def test_tu_khoa_khong_hop_le():
    session = {
        "x-hasura-user-id": "00000000-0000-0000-0000-000000000001",
        "x-hasura-tenant-id": "00000000-0000-0000-0000-000000000002",
    }
    for args, code in (
        ({"query": "  "}, "query-required"),
        ({"query": "x" * 201}, "bad-request"),
        ({"query": "a", "kind": "x"}, "bad-request"),
    ):
        with pytest.raises(ActionError) as exc:
            search.search_documents(None, session, args, None)
        assert exc.value.code == code


def test_tim_de_nghi_va_noi_dung_tep(hasura, conn, s3, search_settings):
    i = ids(conn, "TDX", "c", "tp_mh_dt", "a")
    pr_id = pr(conn, "tim_kiem_hasura", "c", "P_NV_MH_DT", 0, submit=False)
    conn.execute("UPDATE proc.purchase_request SET title = 'Linh kiện dây chuyền SMT' WHERE id = %s", (pr_id,))
    conn.execute(
        """INSERT INTO proc.purchase_request_item (request_id, description, uom, quantity, unit_price)
                    VALUES (%s, 'Tụ điện gốm 100nF', 'cái', 1000, 300)""",
        (pr_id,),
    )
    att = upload(
        hasura, i, pr_id, docx("Hợp đồng khung cung cấp wafer silicon 300mm"), name="hop-dong.docx", ctype=DOCX
    )
    assert hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]["status"] == "CLEAN"
    conn.execute("SELECT proc.submit_purchase_request(%s, %s)", (pr_id, i["c"]))
    sync(search_settings)

    hits = hasura(SEARCH, {"q": "tu dien gom"}, person=i["c"], tenant=i["TDX"])["data"]["search_documents"]
    mine = [h for h in hits if h["entity_id"] == pr_id]
    assert mine and mine[0]["kind"] == "purchase_request" and mine[0]["matched_field"] == "items", hits
    assert "<mark>" in mine[0]["snippet"] and mine[0]["purchase_request"]["title"] == "Linh kiện dây chuyền SMT"

    hits = hasura(SEARCH, {"q": "wafer silicon", "kind": "attachment"}, person=i["tp_mh_dt"], tenant=i["TDX"])["data"][
        "search_documents"
    ]
    assert [h["attachment_id"] for h in hits] == [att], hits
    assert hits[0]["matched_field"] == "content" and hits[0]["attachment"]["file_name"] == "hop-dong.docx"
    assert hits[0]["purchase_request"]["title"] == "Linh kiện dây chuyền SMT"

    for q in ("tu dien gom", "wafer silicon"):
        hits = hasura(SEARCH, {"q": q}, person=i["a"], tenant=i["TDX"])["data"]["search_documents"]
        assert pr_id not in {h["entity_id"] for h in hits}, (q, hits)

    conn.execute(
        "SELECT wf.act((SELECT t.id FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id "
        "WHERE s.entity_id = %s AND t.status = 'OPEN'), %s, 'RETURN', 'Bổ sung báo giá')",
        (pr_id, i["tp_mh_dt"]),
    )
    conn.execute("UPDATE proc.purchase_request SET title = 'Vật tư phòng sạch' WHERE id = %s", (pr_id,))
    delete = """mutation($a: uuid!) { delete_attachment(attachment_id: $a) { status } }"""
    assert (
        hasura(delete, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["delete_attachment"]["status"] == "DELETED"
    )
    sync(search_settings)
    hits = hasura(SEARCH, {"q": "phong sach"}, person=i["c"], tenant=i["TDX"])["data"]["search_documents"]
    assert pr_id in {h["entity_id"] for h in hits}, hits
    hits = hasura(SEARCH, {"q": "wafer silicon"}, person=i["c"], tenant=i["TDX"])["data"]["search_documents"]
    assert att not in {h["attachment_id"] for h in hits}, hits


def test_chi_tim_trong_tenant_cua_phien(hasura, conn, search_settings):
    i = ids(conn, "TDX", "BVX", "c")
    pr_id = pr(conn, "tim_kiem_tenant", "c", "P_NV_MH_DT", 0, submit=False)
    conn.execute("UPDATE proc.purchase_request SET title = 'Máy quét mã vạch kho' WHERE id = %s", (pr_id,))
    sync(search_settings)
    meili = search.Meili(search_settings.meili_url, search_settings.meili_search_key)
    found = meili.search(search_settings.meili_index, {"q": "may quet ma vach", "filter": f'tenant_id = "{i["BVX"]}"'})
    assert found["hits"] == [], "tài liệu của tenant khác không lọt qua bộ lọc tenant"
    data = hasura(SEARCH, {"q": "may quet ma vach"}, person=i["c"], tenant=i["BVX"])
    assert "errors" in data or pr_id not in {h["entity_id"] for h in data["data"]["search_documents"]}


def test_khoa_api_dac_quyen_toi_thieu(search_settings):
    index = search_settings.meili_index
    reader = search.Meili(search_settings.meili_url, search_settings.meili_search_key)
    writer = search.Meili(search_settings.meili_url, search_settings.meili_indexer_key)
    with pytest.raises(search.SearchUnavailable, match="403"):
        reader.request("PUT", f"/indexes/{index}/documents", [{"id": "x", "tenant_id": "x"}])
    with pytest.raises(search.SearchUnavailable, match="403"):
        writer.search(index, {"q": "x"})
    with pytest.raises(search.SearchUnavailable, match="403"):
        writer.request("DELETE", f"/indexes/{index}")
    with pytest.raises(search.SearchUnavailable, match="403"):
        reader.request("GET", "/keys")
    with pytest.raises(search.SearchUnavailable, match="40[13]"):
        search.Meili(search_settings.meili_url, "").search(index, {"q": "x"})


def test_chi_muc_trong_thi_danh_dau_lai(database, search_settings):
    admin = search.Meili(search_settings.meili_url, search_settings.meili_master_key)
    index = search_settings.meili_index + "_rong"
    if admin.request("GET", f"/indexes/{index}", ok404=True):
        admin.wait(admin.request("DELETE", f"/indexes/{index}"))
    search.ensure_index(admin, index)
    writer = search.Meili(search_settings.meili_url, search_settings.meili_indexer_key)
    with psycopg.connect(search_settings.database_url, row_factory=dict_row) as conn:
        assert search_sync.reindex_if_empty(conn, writer, index) > 0
        assert not conn.execute("""SELECT 1 FROM proc.purchase_request r WHERE NOT EXISTS (
                                       SELECT 1 FROM search.pending p WHERE p.entity_id = r.id AND p.dirty)""").fetchone()
    admin.wait(admin.request("DELETE", f"/indexes/{index}"))


def test_chia_van_ban_dai_thanh_nhieu_phan():
    assert search.split_parts("") == [""]
    text = " ".join(f"tu{n}" for n in range(30_000))
    parts = search.split_parts(text, size=10_000)
    assert len(parts) > 1 and all(len(p) <= 10_000 for p in parts)
    assert " ".join(parts) == text
    assert search.part_id("a-1", 0) == "a-1" and search.part_id("a-1", 2) == "a-1-p2"
    capped = search.split_parts(text, size=1_000, max_parts=3)
    assert len(capped) == 4


def test_mot_tep_nhieu_phan_chi_hien_mot_ket_qua():
    class FakeConn:
        def execute(self, *_a, **_k):
            class R:
                def fetchall(self):
                    return [("p0",), ("p1",)]

            return R()

    class FakeMeili:
        def search(self, _index, body):
            hit = {"kind": "attachment", "entity_type": "proc.purchase_request", "entity_id": "e", "attachment_id": "a"}
            return {"hits": [{**hit, "id": "p0", "_rankingScore": 0.9}, {**hit, "id": "p1", "_rankingScore": 0.5}]}

    ctx = type("C", (), {"search": FakeMeili(), "search_index": "documents"})()
    session = {"x-hasura-tenant-id": "00000000-0000-0000-0000-000000000001", "x-hasura-person-id": "p"}
    orig = search.session_identity, search._readable
    search.session_identity = lambda *_: "p"
    search._readable = lambda *_: {"p0", "p1"}
    try:
        out = search.search_documents(FakeConn(), session, {"query": "x"}, ctx)
    finally:
        search.session_identity, search._readable = orig
    assert len(out) == 1 and out[0]["score"] == 0.9
