# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

"""Mô-đun ngoài mẫu "Nhắc việc" cho Bamboo DX-OS (ADR #58): `python app.py`.

Chỉ dùng thư viện chuẩn của Python. Cho thấy ba việc mọi mô-đun ngoài cần làm:
1. Kiểm chữ ký `X-Bamboo-Signature` để chắc yêu cầu đúng là Bamboo chuyển tới (không ai gọi thẳng giả danh người dùng).
2. Dùng đường dẫn tương đối trong trang (trang được phục vụ dưới /ext/<mã>/s/<phiên>/ của Bamboo).
3. Gọi ngược Bamboo qua /ext-api/v1 bằng khóa mô-đun, kèm X-Bamboo-Tenant của người đang dùng.

Biến môi trường: BAMBOO_API (địa chỉ cổng API, ví dụ http://gateway:9080), MODULE_KEY (khóa mô-đun nhận khi đăng ký)
hoặc MODULE_KEY_FILE (tệp chứa khóa), PORT (mặc định 8080).
"""

import hashlib
import hmac
import html
import json
import os
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BAMBOO_API = os.environ.get("BAMBOO_API", "http://localhost:8000").rstrip("/")
MODULE_KEY = os.environ.get("MODULE_KEY", "")
MODULE_KEY_FILE = os.environ.get("MODULE_KEY_FILE", "")
MAX_SKEW = 300


def module_key() -> str:
    """Khóa mô-đun: biến MODULE_KEY, hoặc đọc lại tệp MODULE_KEY_FILE mỗi lần (đổi khóa không cần khởi động lại)."""
    if MODULE_KEY_FILE and os.path.exists(MODULE_KEY_FILE):
        with open(MODULE_KEY_FILE, encoding="utf-8") as f:
            return f.read().strip()
    return MODULE_KEY


def verify(headers, method: str, path: str) -> dict | None:
    """Định danh người dùng nếu chữ ký đúng và còn hạn, không thì None."""
    ts = headers.get("X-Bamboo-Timestamp", "")
    tenant, person = headers.get("X-Bamboo-Tenant", ""), headers.get("X-Bamboo-Person", "")
    key = module_key()
    if not (key and ts.isdigit() and tenant and person) or abs(time.time() - int(ts)) > MAX_SKEW:
        return None
    message = "\n".join((ts, method.upper(), path, tenant, person)).encode()
    expected = hmac.new(key.encode(), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, headers.get("X-Bamboo-Signature", "")):
        return None
    return {"tenant": tenant, "person": person, "name": urllib.parse.unquote(headers.get("X-Bamboo-Person-Name", ""))}


def bamboo(method: str, path: str, tenant: str, body: dict | None = None):
    req = urllib.request.Request(
        f"{BAMBOO_API}/ext-api/v1{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {module_key()}",
            "X-Bamboo-Tenant": tenant,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


PAGE = """<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Nhắc việc</title>
<style>body{{font-family:system-ui,sans-serif;margin:24px;color:#1b2a1f}}h1{{font-size:20px}}
select,input,button{{font:inherit;padding:6px 10px;margin:4px 0}}button{{background:#2f7d43;color:#fff;border:0;border-radius:999px;padding:7px 16px}}
#ketqua{{margin-top:8px;color:#2f7d43}}</style></head><body>
<h1>Nhắc việc</h1><p>Xin chào <strong>{name}</strong>. Mô-đun mẫu gửi lời nhắc tới đồng nghiệp qua thông báo của Bamboo.</p>
<form id="f"><label>Người nhận<br><select name="person_id">{options}</select></label><br>
<label>Nội dung<br><input name="title" size="50" required value="Nhắc việc: nộp báo cáo tuần"></label><br>
<button>Gửi lời nhắc</button></form><div id="ketqua" role="status"></div>
<script>
document.getElementById("f").onsubmit = async (e) => {{
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const r = await fetch("api/nhac", {{method: "POST", headers: {{"Content-Type": "application/json"}}, body: JSON.stringify(data)}});
  document.getElementById("ketqua").textContent = r.ok ? "Đã gửi lời nhắc." : "Không gửi được (" + r.status + ").";
}};
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str = "application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            return self._send(200, b'{"ok": true}')
        user = verify(self.headers, "GET", self.path)
        if user is None:
            return self._send(403, b'{"message": "Chi nhan yeu cau Bamboo chuyen toi"}')
        people = bamboo("GET", "/people", user["tenant"])
        options = "".join(
            f'<option value="{html.escape(p["id"])}">{html.escape(p["full_name"])}</option>' for p in people
        )
        page = PAGE.format(name=html.escape(user["name"]), options=options)
        self._send(200, page.encode(), "text/html; charset=utf-8")

    def do_POST(self):
        user = verify(self.headers, "POST", self.path)
        if user is None or self.path != "/api/nhac":
            return self._send(403, b'{"message": "forbidden"}')
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        result = bamboo(
            "POST",
            "/notifications",
            user["tenant"],
            {"person_id": data.get("person_id"), "title": data.get("title"), "body": f"Từ {user['name']}"},
        )
        self._send(200, json.dumps(result).encode())

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"Mô-đun Nhắc việc nghe cổng {port}, gọi Bamboo ở {BAMBOO_API}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
