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

"""Trợ lý trả lời đúng điều được hỏi, bằng ngôn ngữ của câu hỏi, không lẫn phần lập luận của mô hình (ADR #89).

Các test ở đây không cần CSDL hay Meilisearch: `ai_worker.answer` chạy với Ollama giả (HTTP), kết nối giả ghi lại các
lần cập nhật `core.ai_question` và bộ tìm kiếm giả trả sẵn đoạn tài liệu.
"""

import re
import uuid
from types import SimpleNamespace

import pytest
from test_tro_ly_ai import FakeOllama, chunk

from app import ai_agent, ai_agent_runner, ai_worker, lang
from bamboo_common.ollama import Ollama

MODEL = "qwen3:4b"
REASONING = "Okay, the user is asking about the retention period. Document 1 says 10 years."


@pytest.mark.parametrize(
    ("text", "want"),
    [
        ("Đề nghị mua sắm 120 triệu đồng do ai phê duyệt?", lang.VI),
        ("Hạn mức?", lang.VI),
        ("Giá máy in?", lang.VI),
        ("So sánh hạn mức của công ty và tập đoàn", lang.VI),
        ("In ra danh sách nhà cung cấp", lang.VI),
        ("Deadline approve PR là bao lâu?", lang.VI),
        ("Tôi có thể list các bước không?", lang.VI),
        ("Mua hàng 中国 thì sao?", lang.VI),
        ("de nghi mua sam 120 trieu dong do ai phe duyet", lang.VI),
        ("ho so mua sam luu tru trong bao lau", lang.VI),
        ("nha cung cap chua co trong danh muc thi xu ly the nao", lang.VI),
        ("PR la gi", lang.VI),
        ("so do to chuc", lang.VI),
        ("Who approves a purchase request of 120 million VND?", lang.EN),
        ("Can a rejected purchase request be resubmitted?", lang.EN),
        ("How long are procurement records retained?", lang.EN),
        ("What is hạn mức phê duyệt?", lang.EN),
        ("Who approves a PR under Điều 2 of Quy chế mua sắm?", lang.EN),
        ("can i do it", lang.EN),
        ("被拒绝的采购申请可以重新提交吗？", lang.ZH),
        ("5000万ドン以上の購入には見積書がいくつ必要ですか？", lang.JA),
        ("구매 기록은 얼마 동안 보관됩니까?", lang.KO),
        ("Кто утверждает заявку на закупку?", lang.OTHER),
        ("Combien de devis faut-il pour un achat à partir de 50 millions de dongs ?", lang.OTHER),
        ("Wer genehmigt eine Bestellanforderung über 120 Millionen VND?", lang.OTHER),
        ("Cât costă să cumpăr un server?", lang.OTHER),
        ("Approval limit?", lang.OTHER),
        ("HẠN MỨC PHÊ DUYỆT LÀ GÌ?", lang.VI),
        ("WHO APPROVES THIS REQUEST?", lang.EN),
        ("KPI 2026?", lang.UNKNOWN),
        ("120.000.000", lang.UNKNOWN),
        ("", lang.UNKNOWN),
    ],
)
def test_nhan_ngon_ngu_cau_hoi(text, want):
    assert lang.detect(text) == want


class Rows(list):
    rowcount = 0

    def fetchone(self):
        return self[0] if self else None


class StubConn:
    """Kết nối giả cho `ai_worker.answer`: trả cấu hình guardrail, ngôn ngữ giao diện của người hỏi, cho xem mọi tài
    liệu và ghi lại những gì worker viết vào lượt hỏi."""

    def __init__(self, locale: str | None = None, **guard):
        self.guard = {"pii_guard": False, **guard}
        self.locale = locale
        self.partials: list[tuple] = []
        self.final: dict = {}

    def execute(self, sql, params=()):
        text = " ".join(sql.split())
        if text.startswith("SELECT guardrail_config"):
            return Rows([{"guardrail_config": self.guard}])
        if "FROM collab.person_locale" in text:
            return Rows([{"locale": self.locale}] if self.locale else [])
        if "FROM collab.kb_document d" in text:
            return Rows([{"id": i} for i in params[0]])
        if text.startswith("UPDATE core.ai_question SET thinking = %s, answer = %s"):
            self.partials.append(tuple(params[:2]))
        elif "finished_at = now()" in text:
            names = re.findall(r"(\w+) = %s", text.split(" WHERE ")[0])
            self.final = {k: getattr(v, "obj", v) for k, v in zip(names, params, strict=False)}
        return Rows()

    def commit(self):
        pass

    def rollback(self):
        pass


@pytest.fixture(scope="module")
def ollama():
    fake = FakeOllama()
    yield fake
    fake.server.shutdown()


@pytest.fixture
def fake(ollama, monkeypatch):
    ollama.reply = "Hồ sơ lưu tối thiểu 10 năm [1]."
    ollama.thinking = ""
    ollama.finish_reason = None
    ollama.capabilities = ["completion"]
    ollama.script.clear()
    ollama.bodies.clear()
    ai_worker._reasons.clear()
    monkeypatch.setattr(ai_worker, "FLUSH_SECONDS", 0.0)
    return ollama


def ask(fake, question: str, conn: StubConn | None = None, hits: list[dict] | None = None) -> StubConn:
    conn = conn or StubConn()
    hits = [chunk("A", 0, "Hồ sơ mua sắm lưu tối thiểu 10 năm.", 0.9)] if hits is None else hits
    q = {
        "id": str(uuid.uuid4()),
        "tenant_id": str(uuid.uuid4()),
        "person_id": str(uuid.uuid4()),
        "agent_id": str(uuid.uuid4()),
        "question": question,
        "kb_document_id": None,
        "model": MODEL,
    }
    settings = SimpleNamespace(ai_embed_model="bge-m3", meili_chunk_index="chunks", ai_min_score=0.7)
    meili = SimpleNamespace(search=lambda _index, _body: {"hits": hits})
    gpu = SimpleNamespace(ensure_chat=lambda _model: False)
    conn.status = ai_worker.answer(conn, meili, Ollama(fake.url), settings, q, gpu)
    return conn


def test_prompt_nhac_ngon_ngu_theo_cau_hoi(fake):
    ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?")
    [system, user] = fake.last_messages
    assert system["content"].startswith(ai_worker.SYSTEM_PROMPT) and "<tai_lieu>" in system["content"]
    assert user["content"] == f"Hồ sơ mua sắm lưu trữ trong bao lâu?\n\n({ai_worker.ANSWER_IN[lang.VI]})"

    ask(fake, "How long are procurement records retained?")
    [system, user] = fake.last_messages
    assert system["content"].startswith(ai_worker.SYSTEM_PROMPT_EN), (
        "quy tắc tiếng Anh cho câu hỏi không phải tiếng Việt"
    )
    assert "10 năm" in system["content"], "tài liệu giữ nguyên văn"
    assert user["content"].endswith(f"({ai_worker.ANSWER_IN[lang.EN]})")

    ask(fake, "采购记录保存多久？")
    assert fake.last_messages[0]["content"].startswith(ai_worker.SYSTEM_PROMPT_EN)
    assert fake.last_messages[1]["content"].endswith(f"({ai_worker.ANSWER_IN[lang.ZH]})")
    ask(fake, "Combien de temps les dossiers d'achat sont-ils conservés ?")
    assert fake.last_messages[1]["content"].endswith(f"({ai_worker.ANSWER_IN[lang.OTHER]})")


def test_cau_hoi_khong_ro_ngon_ngu_theo_giao_dien_nguoi_hoi(fake):
    ask(fake, "KPI 2026?", StubConn(locale="en"))
    assert fake.last_messages[1]["content"].endswith(f"({ai_worker.ANSWER_IN[lang.EN]})")
    ask(fake, "KPI 2026?", StubConn())
    assert fake.last_messages[1]["content"].endswith(f"({ai_worker.ANSWER_IN[lang.VI]})")


def test_tu_choi_pham_vi_theo_ngon_ngu_cau_hoi(fake):
    calls = fake.chat_calls
    vi = ask(fake, "Cách nấu phở bò ngon tại nhà?", hits=[])
    en = ask(fake, "How do I cook beef noodle soup at home?", hits=[])
    zh = ask(fake, "在家怎么做牛肉粉？", hits=[])
    assert (vi.status, vi.final["guard"], vi.final["answer"]) == ("refused", "scope", ai_worker.SCOPE_REFUSAL)
    assert en.final["answer"] == "No related content found in the Knowledge library documents you can view."
    assert zh.final["answer"] == en.final["answer"], "ngôn ngữ khác tiếng Việt dùng câu tiếng Anh"
    assert fake.chat_calls == calls, "không gọi mô hình khi không có đoạn nào"


def test_lap_luan_lot_vao_noi_dung_khong_nam_trong_cau_tra_loi(fake):
    fake.capabilities = ["completion", "thinking"]
    fake.reply = f"{REASONING}\n</think>\n\nHồ sơ lưu tối thiểu 10 năm [1]."
    done = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?")
    assert done.status == "done" and done.final["answer"] == "Hồ sơ lưu tối thiểu 10 năm [1]."
    assert done.final["thinking"] is None, "tắt dòng suy nghĩ thì không lưu phần lập luận"
    assert fake.last_body["reasoning_effort"] == "none"
    assert fake.last_body["max_tokens"] == ai_worker.THINK_MAX_TOKENS, "giới hạn token tính cả phần lập luận"
    shown = [answer for _thinking, answer in done.partials]
    assert all("Okay" not in a and "</think>" not in a for a in shown), "lập luận không hiện cả khi đang trả lời dần"
    assert any(a.startswith("Hồ sơ lưu") for a in shown), "câu trả lời vẫn hiện dần sau thẻ đóng"
    assert all(thinking is None for thinking, _answer in done.partials)
    assert ai_worker._reasons[MODEL] is True


def test_lap_luan_het_token_thi_buoc_mo_hinh_tra_loi(fake):
    fake.capabilities = ["completion", "thinking"]
    fake.script = [{"reply": REASONING, "finish_reason": "length"}, {"reply": "Hồ sơ lưu tối thiểu 10 năm [1]."}]
    done = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?")
    assert (done.status, done.final["answer"]) == ("done", "Hồ sơ lưu tối thiểu 10 năm [1].")
    assert done.final["thinking"] is None and all("Okay" not in a for _t, a in done.partials)
    first, second = fake.bodies
    assert first["max_tokens"] == ai_worker.THINK_MAX_TOKENS and second["max_tokens"] == ai_worker.ANSWER_MAX_TOKENS
    assert second["messages"][:2] == first["messages"], "lần gọi thêm giữ nguyên quy tắc, tài liệu và câu hỏi"
    assert second["messages"][2] == {"role": "assistant", "content": f"<think>\n{REASONING}\n</think>\n\n"}
    assert second["reasoning_effort"] == "none"
    spent = len(REASONING.split()) + len("Hồ sơ lưu tối thiểu 10 năm [1].".split())
    assert done.final["completion_tokens"] == spent, "tính cả phần lập luận đã bỏ"
    assert "context_key" in done.final, "câu trả lời sau khi buộc đóng lập luận vẫn dùng lại được"
    assert MODEL not in ai_worker._reasons, "lượt bị cắt chưa cho biết mô hình có tắt được suy nghĩ không"


def test_buoc_tra_loi_ma_van_khong_co_cau_tra_loi_thi_bao_loi(fake):
    fake.capabilities = ["completion", "thinking"]
    fake.script = [{"reply": REASONING, "finish_reason": "length"}, {"reply": ""}]
    vi = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?")
    assert (vi.status, vi.final["status"], vi.final["error"]) == ("error", "error", ai_worker.THINK_OVERRUN_MESSAGE)
    assert "answer" not in vi.final and all(a == "" for _t, a in vi.partials), (
        "lập luận dở dang không thành câu trả lời"
    )
    fake.script = [{"reply": REASONING, "finish_reason": "length"}, {"reply": ""}]
    en = ask(fake, "How long are procurement records retained?")
    assert en.final["error"].startswith("The question needed too much reasoning")


@pytest.mark.parametrize("known", [True, None], ids=["đã biết luôn lập luận", "chưa biết"])
def test_mo_hinh_co_the_suy_nghi_bi_cat_lap_luan_qua_dai(fake, monkeypatch, known):
    monkeypatch.setattr(ai_worker, "REASON_MAX_TOKENS", 5)
    fake.capabilities = ["completion", "thinking"]
    if known:
        ai_worker._reasons[MODEL] = True
    fake.script = [{"reply": REASONING + " Wait, let me check again. " * 40}, {"reply": "10 năm [1]."}]
    cut = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?")
    assert (cut.status, cut.final["answer"], fake.chat_calls and len(fake.bodies)) == ("done", "10 năm [1].", 2)
    prefill = fake.bodies[1]["messages"][2]["content"]
    assert prefill.startswith("<think>\nOkay, the user is asking") and prefill.endswith("\n</think>\n\n")
    assert len(prefill.split()) <= 5 + 2, "chỉ giữ phần lập luận tới lúc bị cắt"
    assert all("Okay" not in a for _t, a in cut.partials) and cut.final["thinking"] is None

    fake.bodies.clear()
    fake.script = [{"reply": "Short check.\n</think>\n\nHồ sơ lưu 10 năm [1]."}]
    short = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?")
    assert short.final["answer"] == "Hồ sơ lưu 10 năm [1]." and len(fake.bodies) == 1, "lập luận ngắn thì không bị cắt"


def test_bat_dong_suy_nghi_het_token_cung_duoc_buoc_tra_loi(fake):
    fake.capabilities = ["completion", "thinking"]
    fake.script = [
        {"thinking": "Văn bản 1 ghi 10 năm, kiểm lại", "reply": "", "finish_reason": "length"},
        {"reply": "Hồ sơ lưu tối thiểu 10 năm [1]."},
    ]
    done = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?", StubConn(think=True))
    assert (done.status, done.final["answer"]) == ("done", "Hồ sơ lưu tối thiểu 10 năm [1].")
    assert done.final["thinking"] == "Văn bản 1 ghi 10 năm, kiểm lại", "dòng suy nghĩ đã hiện vẫn được giữ"
    assert fake.bodies[1]["messages"][2]["content"] == "<think>\nVăn bản 1 ghi 10 năm, kiểm lại\n</think>\n\n"


def test_mo_hinh_khong_tra_ve_gi_thi_bao_loi_thay_vi_cau_tra_loi_rong(fake):
    fake.reply = ""
    empty = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?")
    assert (empty.status, empty.final["error"]) == ("error", ai_worker.ERROR_MESSAGE)


def test_mo_hinh_tat_duoc_suy_nghi_thi_tra_loi_dan_va_gioi_han_ngan(fake):
    fake.capabilities = ["completion", "thinking"]
    first = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?")
    assert first.final["answer"] == "Hồ sơ lưu tối thiểu 10 năm [1]." and ai_worker._reasons[MODEL] is False
    assert fake.last_body["max_tokens"] == ai_worker.THINK_MAX_TOKENS
    assert all(a == "" for _t, a in first.partials), "lượt đầu chưa biết mô hình nên chưa hiện dần"
    second = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?")
    assert fake.last_body["max_tokens"] == ai_worker.ANSWER_MAX_TOKENS
    assert any(a.startswith("Hồ sơ") for _t, a in second.partials)


def test_mo_hinh_khong_biet_suy_nghi_tra_loi_dan_ngay_va_giu_cau_bi_cat(fake):
    fake.reply = "Procurement records are kept for at least 10 years [1] and"
    fake.finish_reason = "length"
    cut = ask(fake, "How long are procurement records retained?")
    assert fake.last_body["max_tokens"] == ai_worker.ANSWER_MAX_TOKENS
    assert cut.status == "done" and cut.final["answer"].startswith("Procurement records are kept")
    assert cut.final["answer"].endswith("\n\n(the answer was cut off because it was too long)")
    assert any(a.startswith("Procurement") for _t, a in cut.partials)
    assert "context_key" not in cut.final, "câu trả lời bị cắt không được dùng lại"


def test_bat_dong_suy_nghi_thi_van_luu_va_hien(fake):
    fake.capabilities = ["completion", "thinking"]
    fake.thinking = "Văn bản 1 ghi 10 năm"
    shown = ask(fake, "Hồ sơ mua sắm lưu trữ trong bao lâu?", StubConn(think=True))
    assert (
        shown.final["thinking"] == "Văn bản 1 ghi 10 năm" and shown.final["answer"] == "Hồ sơ lưu tối thiểu 10 năm [1]."
    )
    assert "reasoning_effort" not in fake.last_body
    assert any(thinking for thinking, _answer in shown.partials)


def test_cau_co_dinh_cua_tro_ly_theo_ngon_ngu():
    for text in (
        ai_worker.SCOPE_REFUSAL,
        ai_worker.ERROR_MESSAGE,
        ai_worker.THINK_OVERRUN_MESSAGE,
        ai_worker.TRUNCATED_NOTE,
        ai_agent.PROMPT_REFUSAL,
    ):
        assert ai_agent.notice(text, lang.VI) == text
        english = ai_agent.notice(text, lang.EN)
        assert english != text and english == ai_agent.notice(text, lang.OTHER), text
        assert lang.detect(english) != lang.VI


@pytest.mark.parametrize(
    ("instructions", "language"),
    [
        ("Kiểm tra đề nghị có đủ ba báo giá theo quy chế không", "tiếng Việt"),
        ("Check whether the request has the three quotations the regulation requires", "English"),
        ("見積書が三つ添付されているか確認してください", "日本語"),
        ("Vérifie que la demande contient les trois devis exigés", "the same language as NHIỆM VỤ"),
    ],
)
def test_tac_tu_tu_hanh_dong_viet_theo_ngon_ngu_nhiem_vu(instructions, language):
    run = {"instructions": instructions, "event": "purchase_request.pending", "allowed_actions": ["comment"]}
    [system, user] = ai_agent_runner.build_messages({**run, "payload": {"doc_no": "PR-2026-0001"}}, None, [])
    assert f"NHIỆM VỤ: {instructions}\nNGÔN NGỮ: {language}\n" in user["content"]
    assert "ngôn ngữ ghi ở dòng NGÔN NGỮ" in system["content"] and "bằng tiếng Việt" not in system["content"]
