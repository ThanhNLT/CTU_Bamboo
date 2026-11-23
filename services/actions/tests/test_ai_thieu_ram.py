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

"""AI tắt khi không có GPU và Docker thiếu RAM (ADR #90): lượt hỏi, OCR lại báo lý do thay vì chờ mãi."""

import http.server
import json
import threading

import pytest

from app.common import ActionError, Context
from app.ocr import require_ai


def sleeper(status: dict | None):
    """Sleeper giả trả `/status`; None là trả lỗi 500."""

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps(status).encode() if status is not None else b"boom"
            self.send_response(200 if status is not None else 500)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


@pytest.mark.parametrize(
    "status",
    [
        {"ai": {"device": "cpu", "ram_mb": 7782, "min_ram_mb": 7168}},
        {"ai": {"device": "gpu", "ram_mb": 4096, "min_ram_mb": 7168}},
        {"ai": {"device": "pending", "ram_mb": None, "min_ram_mb": 7168}},
        {"ollama-core": {"running": True}},
        None,
    ],
)
def test_ai_chay_duoc_thi_cho_qua(status):
    server, url = sleeper(status)
    try:
        require_ai(Context(sleeper_url=url))
    finally:
        server.shutdown()


def test_khong_co_sleeper_thi_cho_qua():
    require_ai(Context())
    require_ai(Context(sleeper_url="http://127.0.0.1:1"))


def test_ai_tat_thi_bao_ly_do():
    server, url = sleeper({"ai": {"device": "off", "ram_mb": 5939, "min_ram_mb": 7168}})
    try:
        with pytest.raises(ActionError) as err:
            require_ai(Context(sleeper_url=url))
    finally:
        server.shutdown()
    assert err.value.code == "ai-unavailable"
    assert err.value.status == 503
    assert "5.8 GB RAM" in err.value.message
    assert "chưa đủ 7 GB" in err.value.message
