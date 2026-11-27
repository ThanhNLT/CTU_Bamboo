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

"""Ứng dụng ngành mẫu "Khách hàng" (CRM rút gọn) cắm vào Bamboo DX-OS ở Tầng 3 (ADR #58, #97): `python app.py`.

Khách hàng và cơ hội bán hàng là dữ liệu riêng của ứng dụng (SQLite); người phụ trách chọn từ nhân sự của Bamboo
(`people.read`) và được báo qua thông báo của Bamboo khi được giao cơ hội hoặc cơ hội đổi giai đoạn (`notify.send`).

Biến môi trường: BAMBOO_API, MODULE_KEY hoặc MODULE_KEY_FILE, PORT (mặc định 8080), DB_PATH (mặc định
/data/khach-hang.db).
"""

import hashlib
import hmac
import html
import json
import os
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BAMBOO_API = os.environ.get("BAMBOO_API", "http://localhost:8000").rstrip("/")
MODULE_KEY = os.environ.get("MODULE_KEY", "")
MODULE_KEY_FILE = os.environ.get("MODULE_KEY_FILE", "")
MAX_SKEW = 300
STAGES = {
    "NEW": "Mới",
    "QUALIFIED": "Đã xác định nhu cầu",
    "PROPOSAL": "Đã gửi báo giá",
    "WON": "Thắng",
    "LOST": "Thua",
}


def module_key() -> str:
    if MODULE_KEY_FILE and os.path.exists(MODULE_KEY_FILE):
        with open(MODULE_KEY_FILE, encoding="utf-8") as f:
            return f.read().strip()
    return MODULE_KEY


def verify(headers, method: str, path: str) -> dict | None:
    """Định danh người dùng nếu chữ ký HMAC của Bamboo đúng và còn hạn, không thì None."""
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


class CrmError(Exception):
    pass


class Store:
    """Khách hàng và cơ hội bán hàng theo công ty (tenant)."""

    def __init__(self, path: str):
        if path != ":memory:":
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        self.db.executescript(
            """CREATE TABLE IF NOT EXISTS customer (
                   id INTEGER PRIMARY KEY, tenant TEXT NOT NULL, name TEXT NOT NULL, tax_code TEXT, phone TEXT,
                   UNIQUE (tenant, name));
               CREATE TABLE IF NOT EXISTS opportunity (
                   id INTEGER PRIMARY KEY, tenant TEXT NOT NULL, customer_id INTEGER NOT NULL REFERENCES customer,
                   title TEXT NOT NULL, value REAL NOT NULL CHECK (value >= 0), stage TEXT NOT NULL,
                   owner_id TEXT NOT NULL, owner_name TEXT NOT NULL, updated_at REAL NOT NULL);"""
        )

    def add_customer(self, tenant: str, name: str, tax_code: str = "", phone: str = "") -> int:
        name = name.strip()
        if not name:
            raise CrmError("Nhập tên khách hàng")
        with self.lock, self.db:
            try:
                return self.db.execute(
                    "INSERT INTO customer (tenant, name, tax_code, phone) VALUES (?, ?, ?, ?)",
                    (tenant, name, tax_code.strip() or None, phone.strip() or None),
                ).lastrowid
            except sqlite3.IntegrityError as exc:
                raise CrmError(f"Đã có khách hàng {name}") from exc

    def add_opportunity(self, tenant: str, customer_id: int, title: str, value: float, owner: dict) -> int:
        if not title.strip() or value < 0:
            raise CrmError("Nhập tên cơ hội và giá trị không âm")
        with self.lock, self.db:
            if not self.db.execute(
                "SELECT 1 FROM customer WHERE tenant = ? AND id = ?", (tenant, customer_id)
            ).fetchone():
                raise CrmError("Không có khách hàng này")
            return self.db.execute(
                """INSERT INTO opportunity (tenant, customer_id, title, value, stage, owner_id, owner_name, updated_at)
                   VALUES (?, ?, ?, ?, 'NEW', ?, ?, ?)""",
                (tenant, customer_id, title.strip(), value, owner["id"], owner["full_name"], time.time()),
            ).lastrowid

    def move(self, tenant: str, opportunity_id: int, stage: str) -> dict:
        """Đổi giai đoạn; cơ hội đã thắng hoặc thua thì không đổi nữa. Trả cơ hội sau khi đổi."""
        if stage not in STAGES:
            raise CrmError("Giai đoạn không hợp lệ")
        with self.lock, self.db:
            row = self.db.execute(
                "SELECT stage FROM opportunity WHERE tenant = ? AND id = ?", (tenant, opportunity_id)
            ).fetchone()
            if row is None:
                raise CrmError("Không có cơ hội này")
            if row[0] in ("WON", "LOST"):
                raise CrmError("Cơ hội đã đóng")
            self.db.execute(
                "UPDATE opportunity SET stage = ?, updated_at = ? WHERE id = ?", (stage, time.time(), opportunity_id)
            )
        return self.opportunities(tenant, opportunity_id)[0]

    def customers(self, tenant: str) -> list[dict]:
        rows = self.db.execute(
            "SELECT id, name, tax_code, phone FROM customer WHERE tenant = ? ORDER BY name", (tenant,)
        ).fetchall()
        return [dict(zip(("id", "name", "tax_code", "phone"), r, strict=True)) for r in rows]

    def opportunities(self, tenant: str, only: int | None = None) -> list[dict]:
        rows = self.db.execute(
            """SELECT o.id, c.name, o.title, o.value, o.stage, o.owner_id, o.owner_name FROM opportunity o
               JOIN customer c ON c.id = o.customer_id
               WHERE o.tenant = ? AND (? IS NULL OR o.id = ?) ORDER BY o.updated_at DESC""",
            (tenant, only, only),
        ).fetchall()
        keys = ("id", "customer", "title", "value", "stage", "owner_id", "owner_name")
        return [dict(zip(keys, r, strict=True)) for r in rows]

    def pipeline(self, tenant: str) -> dict:
        rows = self.db.execute(
            "SELECT stage, count(*), coalesce(sum(value), 0) FROM opportunity WHERE tenant = ? GROUP BY stage",
            (tenant,),
        ).fetchall()
        found = {r[0]: {"count": r[1], "value": r[2]} for r in rows}
        return {s: found.get(s, {"count": 0, "value": 0}) for s in STAGES}


STORE: Store | None = None


def store() -> Store:
    global STORE
    if STORE is None:
        STORE = Store(os.environ.get("DB_PATH", "/data/khach-hang.db"))
    return STORE


STYLE = """body{font-family:system-ui,sans-serif;margin:24px;color:#1b2a1f}h1{font-size:20px}h2{font-size:16px;margin-top:24px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #dfe6e0;padding:6px 8px;text-align:left}
td.n{text-align:right;font-variant-numeric:tabular-nums}select,input,button{font:inherit;padding:6px 10px;margin:4px 0}
button{background:#2f7d43;color:#fff;border:0;border-radius:999px;padding:7px 16px;cursor:pointer}
.stages{display:flex;gap:12px;flex-wrap:wrap}.stage{border:1px solid #dfe6e0;border-radius:12px;padding:10px 14px}"""


def money(v: float) -> str:
    return f"{v:,.0f}".replace(",", ".") + " đ"


def page(user: dict) -> str:
    s, t = store(), user["tenant"]
    people = bamboo("GET", "/people", t)
    pipe = "".join(
        f"<div class='stage'><strong>{STAGES[k]}</strong><br>{v['count']} cơ hội · {money(v['value'])}</div>"
        for k, v in s.pipeline(t).items()
    )
    customers = "".join(f"<option value='{c['id']}'>{html.escape(c['name'])}</option>" for c in s.customers(t))
    owners = "".join(f"<option value='{html.escape(p['id'])}'>{html.escape(p['full_name'])}</option>" for p in people)
    stage_opts = "".join(f"<option value='{k}'>{v}</option>" for k, v in STAGES.items())
    opps = "".join(
        f"<tr><td>{html.escape(o['customer'])}</td><td>{html.escape(o['title'])}</td><td class='n'>{money(o['value'])}</td>"
        f"<td>{html.escape(o['owner_name'])}</td><td>"
        + (
            STAGES[o["stage"]]
            if o["stage"] in ("WON", "LOST")
            else f"<select data-id='{o['id']}' class='doi'>"
            + stage_opts.replace(f"value='{o['stage']}'", f"value='{o['stage']}' selected")
            + "</select>"
        )
        + "</td></tr>"
        for o in s.opportunities(t)
    )
    return f"""<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Khách hàng</title><style>{STYLE}</style>
</head><body><h1>Khách hàng</h1><p>Xin chào <strong>{html.escape(user["name"])}</strong>. Người phụ trách được báo trên
Bamboo khi được giao cơ hội hoặc khi cơ hội đổi giai đoạn.</p><div class="stages">{pipe}</div>
<h2>Thêm khách hàng</h2><form id="kh"><input name="name" placeholder="Tên khách hàng" required>
<input name="tax_code" placeholder="Mã số thuế"> <input name="phone" placeholder="Điện thoại"> <button>Thêm</button></form>
<h2>Thêm cơ hội</h2><form id="ch"><select name="customer_id" required>{customers}</select>
<input name="title" placeholder="Nhu cầu, sản phẩm" required> <input name="value" type="number" min="0" placeholder="Giá trị (đồng)">
<select name="owner_id">{owners}</select> <button>Thêm cơ hội</button></form><div id="kq" role="status"></div>
<h2>Cơ hội</h2><table><thead><tr><th>Khách hàng</th><th>Cơ hội</th><th>Giá trị</th><th>Phụ trách</th><th>Giai đoạn</th>
</tr></thead><tbody>{opps}</tbody></table>
<script>
const kq = document.getElementById("kq");
const post = (url, data) => fetch(url, {{method: "POST", headers: {{"Content-Type": "application/json"}},
  body: JSON.stringify(data)}}).then(async (r) => ({{ok: r.ok, body: await r.json()}}));
const done = (r) => {{ kq.textContent = r.ok ? "Đã lưu." : r.body.message; if (r.ok) setTimeout(() => location.reload(), 500); }};
document.getElementById("kh").onsubmit = async (e) => {{
  e.preventDefault(); done(await post("api/khach-hang", Object.fromEntries(new FormData(e.target))));
}};
document.getElementById("ch").onsubmit = async (e) => {{
  e.preventDefault(); done(await post("api/co-hoi", Object.fromEntries(new FormData(e.target))));
}};
document.querySelectorAll("select.doi").forEach((s) => s.onchange = async () =>
  done(await post("api/giai-doan", {{id: Number(s.dataset.id), stage: s.value}})));
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body, content_type: str = "application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/healthz":
            return self._send(200, {"ok": True})
        user = verify(self.headers, "GET", self.path)
        if user is None:
            return self._send(403, {"message": "Chỉ nhận yêu cầu Bamboo chuyển tới"})
        self._send(200, page(user).encode(), "text/html; charset=utf-8")

    def _notify(self, tenant: str, person_id: str, title: str, body: str) -> None:
        bamboo("POST", "/notifications", tenant, {"person_id": person_id, "title": title, "body": body})

    def do_POST(self):
        user = verify(self.headers, "POST", self.path)
        if user is None:
            return self._send(403, {"message": "forbidden"})
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        t = user["tenant"]
        try:
            if self.path == "/api/khach-hang":
                cid = store().add_customer(t, str(data.get("name") or ""), str(data.get("tax_code") or ""),
                                           str(data.get("phone") or ""))  # fmt: skip
                return self._send(200, {"id": cid})
            if self.path == "/api/co-hoi":
                people = {p["id"]: p for p in bamboo("GET", "/people", t)}
                owner = people.get(str(data.get("owner_id")))
                if owner is None:
                    raise CrmError("Chọn người phụ trách trong công ty")
                title = str(data.get("title") or "")
                oid = store().add_opportunity(t, int(data.get("customer_id") or 0), title,
                                              float(data.get("value") or 0), owner)  # fmt: skip
                self._notify(t, owner["id"], f"Cơ hội mới: {title}", f"{user['name']} giao cho bạn phụ trách.")
                return self._send(200, {"id": oid})
            if self.path == "/api/giai-doan":
                o = store().move(t, int(data.get("id") or 0), str(data.get("stage") or ""))
                self._notify(
                    t, o["owner_id"], f"{o['title']}: {STAGES[o['stage']]}", f"{user['name']} cập nhật giai đoạn."
                )
                return self._send(200, o)
        except (CrmError, ValueError) as exc:
            return self._send(400, {"message": str(exc)})
        self._send(404, {"message": "not found"})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"Ứng dụng Khách hàng nghe cổng {port}, gọi Bamboo ở {BAMBOO_API}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
