# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import http.server
import io
import json
import threading
from types import SimpleNamespace

import psycopg
import pytest
from PIL import Image
from psycopg.rows import dict_row
from test_tep_dinh_kem import CONFIRM, upload
from test_tim_kiem import SEARCH, sync
from test_tro_ly_ai import act, ai_env, fake_ai, make_agent, question  # noqa: F401 (fixture)

from app import ai_worker, ocr
from app.gpu import Gpu, GpuUnavailable
from conftest import ids, pr

RETRY = """mutation($a: uuid!) { ocr_retry(attachment_id: $a) { attachment_id status } }"""
OCR_STATE = """query($a: uuid!) { core_attachment_by_pk(id: $a) { ocr { status pages_total pages_done error } } }"""


def pdf(pages: list[str]) -> bytes:
    """PDF tối giản; trang chuỗi rỗng là trang không có chữ (giống trang quét)."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", ""]
    kids = []
    for text in pages:
        stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode() if text else b""
        content = len(objs) + 2
        kids.append(f"{len(objs) + 1} 0 R")
        objs.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {content} 0 R "
            "/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>"
        )
        objs.append(f"<< /Length {len(stream)} >>\nstream\n{stream.decode()}\nendstream")
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(pages)} >>"
    out, offsets = io.BytesIO(), []
    out.write(b"%PDF-1.4\n")
    for n, body in enumerate(objs, 1):
        offsets.append(out.tell())
        out.write(f"{n} 0 obj\n{body}\nendobj\n".encode())
    xref = out.tell()
    out.write(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode())
    out.write("".join(f"{o:010d} 00000 n \n" for o in offsets).encode())
    out.write(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


def png(width: int = 64, height: int = 32) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buf, format="PNG")
    return buf.getvalue()


class FakeOcr:
    """Dịch vụ OCR giả: trả `text` cho mọi trang; `oom` lần đầu trả 507 (hết VRAM)."""

    def __init__(self):
        self.text = "BÁO GIÁ máy bơm ly tâm Ebara"
        self.oom = 0
        self.calls = 0
        self.unloads = 0
        fake = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def _json(self, code: int, body: dict):
                data = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length") or 0))
                if self.path == "/unload":
                    fake.unloads += 1
                    self._json(200, {"unloaded": True})
                    return
                fake.calls += 1
                if fake.oom > 0:
                    fake.oom -= 1
                    self._json(507, {"error": "out of memory"})
                    return
                self._json(200, {"lines": [{"text": t} for t in fake.text.split("\n")], "text": fake.text})

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()


@pytest.fixture(scope="session")
def fake_ocr():
    fake = FakeOcr()
    yield fake
    fake.server.shutdown()


@pytest.fixture
def ocr_env(ai_env, fake_ocr, s3, conn):  # noqa: F811 (fixture từ test_tro_ly_ai)
    conn.execute("UPDATE core.attachment_ocr SET status = 'SKIPPED' WHERE status IN ('PENDING', 'RUNNING')")
    fake_ocr.text, fake_ocr.oom, fake_ocr.calls, fake_ocr.unloads = "BÁO GIÁ máy bơm ly tâm Ebara", 0, 0, 0
    client = ocr.OcrClient(fake_ocr.url)
    return SimpleNamespace(
        **ai_env.__dict__,
        ocr=fake_ocr,
        gpu=Gpu(ai_env.ai, client, ai_env.settings.ai_cpu_models),
        files=ocr.Files(s3.read_stored),
    )


def ocr_all(env) -> list[str]:
    with psycopg.connect(env.settings.database_url, row_factory=dict_row) as w:
        steps = []
        while (s := ocr.run_once(w, env.gpu, env.files)) is not None:
            steps.append(s)
        return steps


def state(conn, attachment_id: str) -> dict:
    return conn.execute("SELECT * FROM core.attachment_ocr WHERE attachment_id = %s", (attachment_id,)).fetchone()


def test_chon_trang_can_ocr():
    assert ocr.plan("image/png", png()) == ([0], None)
    text = "Bao gia may bom ly tam Ebara, giao trong 30 ngay"
    assert ocr.plan("application/pdf", pdf([text, "", text, ""])) == ([1, 3], None)
    pages, note = ocr.plan("application/pdf", pdf([""] * (ocr.MAX_PAGES + 2)))
    assert pages == list(range(ocr.MAX_PAGES)) and note and str(ocr.MAX_PAGES) in note
    image = Image.open(io.BytesIO(ocr.render("application/pdf", pdf(["", text]), 0)))
    assert image.format == "PNG" and image.width == round(612 * ocr.RENDER_DPI / 72)


def test_ocr_anh_quet_roi_tim_duoc(hasura, conn, ocr_env, search_settings):
    i = ids(conn, "TDX", "c", "a")
    pr_id = pr(conn, "ocr_anh", "c", "P_NV_MH_DT", 0, submit=False)
    att = upload(hasura, i, pr_id, png(), name="bao-gia.png", ctype="image/png")
    assert hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["confirm_upload"]["status"] == "CLEAN"
    assert state(conn, att)["status"] == "PENDING"

    assert ocr_all(ocr_env) == ["DONE"]
    s = state(conn, att)
    assert (s["pages_total"], s["pages_done"], s["page_texts"]) == (1, 1, ["BÁO GIÁ máy bơm ly tâm Ebara"])
    seen = hasura(OCR_STATE, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["core_attachment_by_pk"]["ocr"]
    assert seen == {"status": "DONE", "pages_total": 1, "pages_done": 1, "error": None}

    sync(search_settings)
    hits = hasura(SEARCH, {"q": "may bom ly tam", "kind": "attachment"}, person=i["c"], tenant=i["TDX"])["data"]
    assert [h["attachment_id"] for h in hits["search_documents"]] == [att], hits

    other = hasura(RETRY, {"a": att}, person=i["a"], tenant=i["TDX"])
    assert "errors" in other, "người không xem được chứng từ không thử lại được"
    again = hasura(RETRY, {"a": att}, person=i["c"], tenant=i["TDX"])["data"]["ocr_retry"]
    assert again == {"attachment_id": att, "status": "PENDING"}
    busy = hasura(RETRY, {"a": att}, person=i["c"], tenant=i["TDX"])
    assert "đang" in busy["errors"][0]["message"].lower(), busy
    retried = conn.execute(
        "SELECT actor_id FROM audit.log WHERE table_name = 'core.attachment_ocr' AND row_id = %s AND op = 'UPDATE'",
        (att,),
    ).fetchall()
    assert [str(r["actor_id"]) for r in retried] == [i["c"]]


def test_pdf_chi_ocr_trang_quet(hasura, conn, ocr_env):
    i = ids(conn, "TDX", "c")
    pr_id = pr(conn, "ocr_pdf", "c", "P_NV_MH_DT", 0, submit=False)
    text = "Hop dong khung cung cap vat tu nam 2026"
    mixed = upload(hasura, i, pr_id, pdf([text, ""]), name="hop-dong.pdf")
    digital = upload(hasura, i, pr_id, pdf([text]), name="so.pdf")
    for a in (mixed, digital):
        hasura(CONFIRM, {"a": a}, person=i["c"], tenant=i["TDX"])
    assert sorted(ocr_all(ocr_env)) == ["DONE", "SKIPPED"]
    assert (state(conn, mixed)["pages"], state(conn, mixed)["status"]) == ([1], "DONE")
    assert state(conn, digital)["status"] == "SKIPPED" and ocr_env.ocr.calls == 1


def test_het_vram_go_mo_hinh_sinh_roi_thu_lai(hasura, conn, ocr_env):
    i = ids(conn, "TDX", "c")
    pr_id = pr(conn, "ocr_vram", "c", "P_NV_MH_DT", 0, submit=False)
    att = upload(hasura, i, pr_id, png(), name="hoa-don.png", ctype="image/png")
    hasura(CONFIRM, {"a": att}, person=i["c"], tenant=i["TDX"])
    ocr_env.ai.load("qwen3:4b")
    ocr_env.ai.http.post("/api/embed", json={"model": "bge-m3", "input": ["x"]})
    ocr_env.fake.loaded["bge-m3:latest"] = 0.0
    ocr_env.ocr.oom = 1
    assert ocr_all(ocr_env) == ["DONE"]
    assert ocr_env.fake.unloads == ["qwen3:4b"], "chỉ gỡ mô hình chính, giữ mô hình phụ"

    conn.execute("UPDATE core.attachment_ocr SET status = 'ERROR' WHERE attachment_id = %s", (att,))
    hasura(RETRY, {"a": att}, person=i["c"], tenant=i["TDX"])
    ocr_env.ocr.oom = 2 * ocr.MAX_ATTEMPTS
    for _ in range(ocr.MAX_ATTEMPTS):
        conn.execute("UPDATE core.attachment_ocr SET next_attempt_at = now() WHERE attachment_id = %s", (att,))
        ocr_all(ocr_env)
    s = state(conn, att)
    assert (s["status"], s["error"], s["attempts"]) == ("ERROR", ocr.OOM_ERROR, ocr.MAX_ATTEMPTS)


def test_mo_hinh_sinh_phai_nam_tron_tren_gpu(ocr_env):
    ocr_env.fake.vram_ratio = 1.0
    ocr_env.gpu.ensure_chat("qwen3:4b")
    assert ocr_env.ocr.unloads == 1, "nạp mô hình sinh thì gỡ bộ OCR trước"
    ocr_env.gpu.ensure_chat("qwen3:4b")
    assert ocr_env.ocr.unloads == 1, "đã nằm trọn trên GPU thì không nạp lại"

    ocr_env.fake.loaded.clear()
    ocr_env.fake.vram_ratio = 0.6
    with pytest.raises(GpuUnavailable):
        ocr_env.gpu.ensure_chat("qwen3:4b")
    assert "qwen3:4b" not in ocr_env.fake.loaded, "không để mô hình chia lớp sang CPU"


def test_luot_hoi_cho_gpu_roi_bao_loi(ocr_env, conn):
    i = ids(conn, "TDX", "c")
    agent = make_agent(conn, scope_guard=False)
    asked = act("ai_ask", {"agent_id": agent, "question": "Hạn mức mua sắm?"}, i["c"], i["TDX"], ocr_env.ctx)
    ocr_env.fake.vram_ratio = 0.5
    with psycopg.connect(ocr_env.settings.database_url, row_factory=dict_row) as w:
        with pytest.raises(GpuUnavailable):
            ai_worker.run_once(w, ocr_env.searcher, ocr_env.ai, ocr_env.settings, ocr_env.gpu)
        q = question(conn, asked["id"])
        assert q["status"] == "queued" and q["gpu_wait_since"] is not None and q["answer"] == ""

        conn.execute(
            "UPDATE core.ai_question SET gpu_wait_since = now() - interval '1 hour' WHERE id = %s", (asked["id"],)
        )
        assert ai_worker.run_once(w, ocr_env.searcher, ocr_env.ai, ocr_env.settings, ocr_env.gpu) == "error"
    q = question(conn, asked["id"])
    assert (q["status"], q["error"]) == ("error", ai_worker.GPU_ERROR)
    assert ocr_env.ai.running() == [], "mô hình không nạp trọn đã bị gỡ"
