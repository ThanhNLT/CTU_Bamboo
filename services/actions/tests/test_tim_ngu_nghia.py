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

"""Tìm theo ý nghĩa trên trang Tìm kiếm (ADR #92): vector trong chỉ mục `documents`, kết quả nối sau từ khóa."""

import psycopg
import pytest
from psycopg.rows import dict_row
from test_tro_ly_ai import FakeOllama

from app import search, search_sync
from app.common import ActionError, Context
from bamboo_common.ollama import Ollama, OllamaUnavailable
from conftest import ids, pr

TENANT = "00000000-0000-0000-0000-000000000001"
SESSION = {"x-hasura-tenant-id": TENANT, "x-hasura-user-id": "p"}


def test_van_ban_dai_dien_bo_ma_so():
    doc = {
        "doc_no": "PR-2026-000123",
        "title": "Thiết bị cho nhân sự mới",
        "items": ["Máy tính xách tay", "Chuột không dây"],
        "partner": "Công ty TNHH Tin học A",
        "description": None,
        "content": "x" * 5000,
    }
    text = search.semantic_text(doc)
    assert "PR-2026" not in text, "mã chứng từ làm mọi vector giống nhau"
    assert text.startswith("Thiết bị cho nhân sự mới") and "Máy tính xách tay; Chuột không dây" in text
    assert "Nhà cung cấp: Công ty TNHH Tin học A" in text and len(text) <= search.SEMANTIC_TEXT_CHARS


class FakeAi:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.calls: list[list[str]] = []

    def embed(self, _model, texts, timeout=None):
        self.calls.append(texts)
        if self.fail:
            raise OllamaUnavailable("Ollama không truy cập được")
        return [[1.0] + [0.0] * (search.DIMENSIONS - 1) for _ in texts]


def test_moi_tai_lieu_deu_co_khoa_vector():
    settings = type("S", (), {"ai_embed_model": "bge-m3"})()
    docs = [{"id": "a", "title": "Giấy A4"}, {"id": "b", "file_name": "bao-gia.pdf", "content": "báo giá"}]
    out, embedded = search_sync.with_vectors(docs, FakeAi(), settings)
    assert embedded and all(len(d["_vectors"][search.EMBEDDER]) == search.DIMENSIONS for d in out)
    for ai in (None, FakeAi(fail=True)):
        out, embedded = search_sync.with_vectors(docs, ai, settings)
        assert not embedded and [d["_vectors"] for d in out] == [{search.EMBEDDER: None}] * 2, (
            "thiếu khóa _vectors thì Meilisearch từ chối cả lô; null vẫn tìm được theo từ khóa"
        )
    assert search_sync.with_vectors([], FakeAi(), settings) == ([], False)


class FakeMeili:
    def __init__(self, keyword: list[str], semantic: list[tuple[str, float]], semantic_error: bool = False):
        self.keyword, self.semantic, self.semantic_error = keyword, semantic, semantic_error
        self.bodies: list[dict] = []

    @staticmethod
    def _hit(doc_id: str, score: float, highlight: bool) -> dict:
        title = "<b>Giấy</b>" if highlight else "Văn phòng phẩm"
        return {
            "id": doc_id,
            "kind": "purchase_request",
            "entity_type": "proc.purchase_request",
            "entity_id": doc_id,
            "_rankingScore": score,
            "_formatted": {"title": title.replace("<b>", search._PRE).replace("</b>", search._POST)},
        }

    def search(self, _index, body):
        self.bodies.append(body)
        if "vector" in body:
            if self.semantic_error:
                raise search.SearchUnavailable("Cannot find embedder with name `bge`")
            return {"hits": [self._hit(i, s, False) for i, s in self.semantic][body["offset"] :]}
        return {"hits": [self._hit(i, 0.9, True) for i in self.keyword][body["offset"] :]}


def run(meili: FakeMeili, ai, query: str = "đồ dùng văn phòng", **args) -> list[dict]:
    ctx = Context(search=meili, search_index="documents", ai=ai, ai_embed_model="bge-m3")
    orig = search._readable
    search._readable = lambda _c, _p, hits: {h["id"] for h in hits}
    try:
        return search.search_documents(None, SESSION, {"query": query, **args}, ctx)
    finally:
        search._readable = orig


def test_tu_khoa_truoc_y_nghia_sau_khong_trung():
    meili = FakeMeili(keyword=["a", "b"], semantic=[("b", 0.82), ("c", 0.8)])
    out = run(meili, FakeAi())
    assert [(r["entity_id"], r["semantic_score"]) for r in out] == [("a", None), ("b", None), ("c", 0.6)]
    assert out[0]["matched_field"] == "title" and out[2]["matched_field"] is None
    vector_body = meili.bodies[-1]
    assert vector_body["hybrid"] == {"embedder": search.EMBEDDER, "semanticRatio": 1.0}
    assert vector_body["rankingScoreThreshold"] == pytest.approx((1 + search.SEMANTIC_MIN_COS) / 2)
    assert vector_body["filter"] == f'tenant_id = "{TENANT}"', "tìm theo ý nghĩa vẫn lọc theo tenant"


def test_du_ket_qua_tu_khoa_thi_khong_goi_mo_hinh():
    ai = FakeAi()
    out = run(FakeMeili(keyword=[f"k{n}" for n in range(5)], semantic=[("s", 0.9)]), ai, limit=3)
    assert [r["entity_id"] for r in out] == ["k0", "k1", "k2"] and ai.calls == []


@pytest.mark.parametrize("query", ["PR-2026-000123", "0312345678", "ab"])
def test_ma_so_va_cau_qua_ngan_chi_tim_tu_khoa(query):
    ai = FakeAi()
    run(FakeMeili(keyword=["a"], semantic=[("s", 0.9)]), ai, query=query)
    assert ai.calls == []


def test_che_do_tim():
    meili = FakeMeili(keyword=["a"], semantic=[("s", 0.9)])
    assert [r["entity_id"] for r in run(meili, FakeAi(), mode="keyword")] == ["a"]
    assert [r["entity_id"] for r in run(meili, FakeAi(), mode="semantic")] == ["s"]
    assert [r["entity_id"] for r in run(meili, FakeAi(fail=True), mode="semantic")] == ["a"], (
        "AI chưa sẵn sàng thì chế độ ý nghĩa quay về từ khóa, không trả rỗng"
    )
    with pytest.raises(ActionError):
        run(meili, FakeAi(), mode="vector")


def test_loi_phan_y_nghia_khong_lam_hong_tim_kiem():
    out = run(FakeMeili(keyword=["a"], semantic=[], semantic_error=True), FakeAi())
    assert [r["entity_id"] for r in out] == ["a"]
    assert [r["entity_id"] for r in run(FakeMeili(keyword=["a"], semantic=[("s", 0.9)]), None)] == ["a"]


def test_them_embedder_vao_chi_muc_cu(search_settings):
    """Chỉ mục của bản trước ADR #92 có tài liệu không vector: Meilisearch từ chối thêm embedder nên phải làm trống."""
    admin = search.Meili(search_settings.meili_url, search_settings.meili_master_key)
    index = search_settings.meili_index + "_cu"
    if admin.request("GET", f"/indexes/{index}", ok404=True):
        admin.wait(admin.request("DELETE", f"/indexes/{index}"))
    old = {k: v for k, v in search.index_settings().items() if k != "embedders"}
    assert search.ensure_index(admin, index, old)
    admin.put_documents(index, [{"id": "x", "tenant_id": TENANT, "title": "Giấy A4"}])
    assert not search.ensure_index(admin, index, old), "chỉ mục có sẵn, không đổi gì"
    assert search.ensure_index(admin, index), "thêm embedder làm trống chỉ mục để search-sync nạp lại"
    assert admin.document_count(index) == 0
    assert search.EMBEDDER in admin.request("GET", f"/indexes/{index}/settings")["embedders"]
    near = [1.0] + [0.0] * (search.DIMENSIONS - 1)
    far = [0.0, 1.0] + [0.0] * (search.DIMENSIONS - 2)
    admin.put_documents(
        index,
        [
            {"id": "gan", "tenant_id": TENANT, "title": "Văn phòng phẩm", "_vectors": {search.EMBEDDER: near}},
            {"id": "xa", "tenant_id": TENANT, "title": "Xe tải", "_vectors": {search.EMBEDDER: far}},
            {"id": "chua", "tenant_id": TENANT, "title": "Bàn ghế", "_vectors": {search.EMBEDDER: None}},
        ],
    )
    found = admin.search(
        index,
        {
            "q": "",
            "vector": near,
            "hybrid": {"embedder": search.EMBEDDER, "semanticRatio": 1.0},
            "rankingScoreThreshold": (1 + search.SEMANTIC_MIN_COS) / 2,
            "filter": f'tenant_id = "{TENANT}"',
        },
    )
    assert [h["id"] for h in found["hits"]] == ["gan"], (
        "ngưỡng cos bỏ tài liệu không liên quan và tài liệu chưa có vector"
    )
    with pytest.raises(search.SearchUnavailable, match="no vectors provided"):
        admin.put_documents(index, [{"id": "thieu", "tenant_id": TENANT, "title": "Thiếu khóa vector"}])
    admin.wait(admin.request("DELETE", f"/indexes/{index}"))


def test_dong_bo_ghi_vector_va_nap_lai_khi_ai_san_sang(conn, search_settings, monkeypatch):
    # Vector của Ollama giả là túi từ: cos thấp hơn bge-m3 thật nên hạ ngưỡng; câu không chung từ nào vẫn bị loại.
    monkeypatch.setattr(search, "SEMANTIC_MIN_COS", 0.3)
    i = ids(conn, "TDX", "c")
    pr_id = pr(conn, "tim_ngu_nghia", "c", "P_NV_MH_DT", 0, submit=False)
    conn.execute("UPDATE proc.purchase_request SET title = 'Bàn phím cơ cho phòng thiết kế' WHERE id = %s", (pr_id,))
    meili = search.Meili(search_settings.meili_url, search_settings.meili_indexer_key)
    fake = FakeOllama()
    try:
        with psycopg.connect(search_settings.database_url, row_factory=dict_row) as work:
            while search_sync.run_once(work, meili, search_settings, limit=200):
                pass
            embedded = work.execute("SELECT embedded FROM search.pending WHERE entity_id = %s", (pr_id,)).fetchone()
            assert embedded == {"embedded": False}, "chưa có AI: nạp để tìm từ khóa, đánh dấu thiếu vector"
            assert search_sync.missing_vectors(work) and search_sync.mark_missing_vectors(work) > 0
            ai = Ollama(fake.url)
            while search_sync.run_once(work, meili, search_settings, limit=200, ai=ai):
                pass
            embedded = work.execute("SELECT embedded FROM search.pending WHERE entity_id = %s", (pr_id,)).fetchone()
            assert embedded == {"embedded": True}
        ctx = Context(
            search=search.Meili(search_settings.meili_url, search_settings.meili_search_key),
            search_index=search_settings.meili_index,
            ai=Ollama(fake.url),
            ai_embed_model=search_settings.ai_embed_model,
        )
        session = {"x-hasura-tenant-id": i["TDX"], "x-hasura-user-id": i["c"]}
        with psycopg.connect(search_settings.database_url) as reader:
            hits = search.search_documents(
                reader, session, {"query": "bàn phím cơ cho phòng thiết kế", "mode": "semantic"}, ctx
            )
            mine = [h for h in hits if h["entity_id"] == pr_id]
            assert mine and mine[0]["semantic_score"] >= search.SEMANTIC_MIN_COS, hits
            assert search.search_documents(reader, session, {"query": "zebra quokka", "mode": "semantic"}, ctx) == []
    finally:
        fake.server.shutdown()
