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

"""Ứng dụng ngành mẫu "Kho hàng" (WMS rút gọn) cắm vào Bamboo DX-OS ở Tầng 3 (ADR #58, #97): `python app.py`.

Chỉ dùng thư viện chuẩn Python, dữ liệu riêng của ứng dụng (sổ nhập xuất kho) nằm trong SQLite của chính nó; dữ liệu
dùng chung lấy từ Bamboo qua /ext-api/v1 bằng khóa mô-đun:

- `receipts.read`: phiếu nhận hàng của đề nghị mua sắm đã duyệt -> nhập kho (mỗi phiếu chỉ nhập một lần).
- `items.read`: danh mục vật tư để chọn khi xuất kho.
- `org.read`: đơn vị làm kho (kho của đơn vị nhận hàng).
- `people.read`, `notify.send`: báo người phụ trách khi tồn kho xuống dưới mức tối thiểu.

Biến môi trường: BAMBOO_API, MODULE_KEY hoặc MODULE_KEY_FILE, PORT (mặc định 8080), DB_PATH (mặc định
/data/kho-hang.db), MIN_STOCK (mặc định 10).
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
MIN_STOCK = float(os.environ.get("MIN_STOCK", "10"))
MAX_SKEW = 300


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


class StockError(Exception):
    pass


class Store:
    """Sổ nhập xuất kho theo công ty (tenant), kho (đơn vị) và mã hàng; tồn kho là tổng các bút toán."""

    def __init__(self, path: str):
        if path != ":memory:":
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        self.db.executescript(
            """CREATE TABLE IF NOT EXISTS stock_move (
                   id INTEGER PRIMARY KEY, tenant TEXT NOT NULL, warehouse_id TEXT NOT NULL, warehouse TEXT NOT NULL,
                   item_code TEXT NOT NULL, description TEXT NOT NULL, uom TEXT NOT NULL, quantity REAL NOT NULL,
                   source TEXT NOT NULL CHECK (source IN ('RECEIPT', 'ISSUE')), ref TEXT, actor TEXT, at REAL NOT NULL);
               CREATE TABLE IF NOT EXISTS imported_receipt (
                   tenant TEXT NOT NULL, receipt_id TEXT NOT NULL, PRIMARY KEY (tenant, receipt_id));"""
        )

    def import_receipts(self, tenant: str, receipts: list[dict], actor: str) -> int:
        """Nhập kho từ phiếu nhận hàng của Bamboo; phiếu đã nhập thì bỏ qua. Trả số phiếu mới nhập."""
        count = 0
        with self.lock, self.db:
            for r in receipts:
                done = self.db.execute(
                    "SELECT 1 FROM imported_receipt WHERE tenant = ? AND receipt_id = ?", (tenant, r["id"])
                ).fetchone()
                if done:
                    continue
                for line in r["lines"]:
                    code = line.get("item_code") or line["description"]
                    self.db.execute(
                        """INSERT INTO stock_move (tenant, warehouse_id, warehouse, item_code, description, uom, quantity,
                                                   source, ref, actor, at) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECEIPT', ?, ?, ?)""",
                        (tenant, r["org_unit_id"], r["org_unit"], code, line["description"], line["uom"],
                         float(line["quantity"]), r["doc_no"], actor, time.time()),
                    )  # fmt: skip
                self.db.execute("INSERT INTO imported_receipt VALUES (?, ?)", (tenant, r["id"]))
                count += 1
        return count

    def on_hand(self, tenant: str) -> list[dict]:
        rows = self.db.execute(
            """SELECT warehouse_id, warehouse, item_code, max(description), max(uom), sum(quantity)
               FROM stock_move WHERE tenant = ? GROUP BY warehouse_id, warehouse, item_code
               HAVING sum(quantity) <> 0 ORDER BY warehouse, item_code""",
            (tenant,),
        ).fetchall()
        keys = ("warehouse_id", "warehouse", "item_code", "description", "uom", "quantity")
        return [dict(zip(keys, r, strict=True)) for r in rows]

    def issue(self, tenant: str, warehouse_id: str, item_code: str, quantity: float, ref: str, actor: str) -> float:
        """Xuất kho; không xuất quá tồn. Trả số tồn còn lại."""
        if quantity <= 0:
            raise StockError("Số lượng xuất phải lớn hơn 0")
        with self.lock, self.db:
            row = self.db.execute(
                """SELECT max(warehouse), max(description), max(uom), coalesce(sum(quantity), 0) FROM stock_move
                   WHERE tenant = ? AND warehouse_id = ? AND item_code = ?""",
                (tenant, warehouse_id, item_code),
            ).fetchone()
            if row[0] is None or row[3] < quantity:
                raise StockError(f"Tồn kho không đủ: còn {row[3] or 0:g}")
            self.db.execute(
                """INSERT INTO stock_move (tenant, warehouse_id, warehouse, item_code, description, uom, quantity, source,
                                           ref, actor, at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ISSUE', ?, ?, ?)""",
                (tenant, warehouse_id, row[0], item_code, row[1], row[2], -quantity, ref, actor, time.time()),
            )
            return row[3] - quantity

    def history(self, tenant: str, limit: int = 30) -> list[dict]:
        rows = self.db.execute(
            """SELECT source, ref, warehouse, item_code, quantity, uom, actor, at FROM stock_move
               WHERE tenant = ? ORDER BY id DESC LIMIT ?""",
            (tenant, limit),
        ).fetchall()
        keys = ("source", "ref", "warehouse", "item_code", "quantity", "uom", "actor", "at")
        return [dict(zip(keys, r, strict=True)) for r in rows]


STORE: Store | None = None


def store() -> Store:
    global STORE
    if STORE is None:
        STORE = Store(os.environ.get("DB_PATH", "/data/kho-hang.db"))
    return STORE


STYLE = """body{font-family:system-ui,sans-serif;margin:24px;color:#1b2a1f}h1{font-size:20px}h2{font-size:16px;margin-top:24px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #dfe6e0;padding:6px 8px;text-align:left}
td.n{text-align:right;font-variant-numeric:tabular-nums}select,input,button{font:inherit;padding:6px 10px;margin:4px 0}
button{background:#2f7d43;color:#fff;border:0;border-radius:999px;padding:7px 16px;cursor:pointer}
.low{color:#b45309;font-weight:600}#kq{margin-top:8px}"""


def page(user: dict) -> str:
    s = store()
    rows = s.on_hand(user["tenant"])
    people = bamboo("GET", "/people", user["tenant"])
    stock = (
        "".join(
            f"<tr><td>{html.escape(r['warehouse'])}</td><td>{html.escape(r['item_code'])}</td>"
            f"<td>{html.escape(r['description'])}</td><td class='n{' low' if r['quantity'] < MIN_STOCK else ''}'>"
            f"{r['quantity']:g} {html.escape(r['uom'])}</td></tr>"
            for r in rows
        )
        or "<tr><td colspan=4>Chưa có hàng trong kho. Bấm Nhập từ phiếu nhận hàng.</td></tr>"
    )
    picks = "".join(
        f"<option value='{html.escape(json.dumps([r['warehouse_id'], r['item_code']]))}'>"
        f"{html.escape(r['warehouse'])} · {html.escape(r['item_code'])} ({r['quantity']:g} {html.escape(r['uom'])})</option>"
        for r in rows
    )
    owners = "".join(f"<option value='{html.escape(p['id'])}'>{html.escape(p['full_name'])}</option>" for p in people)
    moves = "".join(
        f"<tr><td>{'Nhập' if m['source'] == 'RECEIPT' else 'Xuất'}</td><td>{html.escape(m['ref'] or '')}</td>"
        f"<td>{html.escape(m['warehouse'])}</td><td>{html.escape(m['item_code'])}</td>"
        f"<td class='n'>{m['quantity']:g} {html.escape(m['uom'])}</td><td>{html.escape(m['actor'] or '')}</td></tr>"
        for m in s.history(user["tenant"])
    )
    return f"""<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Kho hàng</title><style>{STYLE}</style>
</head><body><h1>Kho hàng</h1><p>Xin chào <strong>{html.escape(user["name"])}</strong>. Hàng về theo phiếu nhận hàng của
Bamboo được nhập vào kho của đơn vị nhận; tồn dưới {MIN_STOCK:g} được tô màu và báo người phụ trách khi xuất.</p>
<button id="nhap">Nhập từ phiếu nhận hàng</button> <span id="kq" role="status"></span>
<h2>Tồn kho</h2><table><thead><tr><th>Kho</th><th>Mã hàng</th><th>Mô tả</th><th>Tồn</th></tr></thead>
<tbody>{stock}</tbody></table>
<h2>Xuất kho</h2><form id="xuat"><label>Hàng<br><select name="pick" required>{picks}</select></label><br>
<label>Số lượng<br><input name="quantity" type="number" min="0" step="any" required></label><br>
<label>Chứng từ xuất<br><input name="ref" placeholder="Phiếu xuất, lệnh sản xuất..."></label><br>
<label>Người phụ trách nhận cảnh báo tồn thấp<br><select name="owner">{owners}</select></label><br>
<button>Xuất kho</button></form>
<h2>Nhập xuất gần đây</h2><table><thead><tr><th>Loại</th><th>Chứng từ</th><th>Kho</th><th>Mã hàng</th><th>Số lượng</th>
<th>Người làm</th></tr></thead><tbody>{moves}</tbody></table>
<script>
const kq = document.getElementById("kq");
const post = (url, data) => fetch(url, {{method: "POST", headers: {{"Content-Type": "application/json"}},
  body: JSON.stringify(data)}}).then(async (r) => ({{ok: r.ok, body: await r.json()}}));
document.getElementById("nhap").onclick = async () => {{
  const r = await post("api/nhap", {{}});
  kq.textContent = r.ok ? `Đã nhập ${{r.body.imported}} phiếu nhận hàng.` : r.body.message;
  if (r.ok) setTimeout(() => location.reload(), 600);
}};
document.getElementById("xuat").onsubmit = async (e) => {{
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const [warehouse_id, item_code] = JSON.parse(d.pick);
  const r = await post("api/xuat", {{warehouse_id, item_code, quantity: Number(d.quantity), ref: d.ref, owner: d.owner}});
  kq.textContent = r.ok ? `Đã xuất, còn ${{r.body.remaining}}.` : r.body.message;
  if (r.ok) setTimeout(() => location.reload(), 600);
}};
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

    def do_POST(self):
        user = verify(self.headers, "POST", self.path)
        if user is None:
            return self._send(403, {"message": "forbidden"})
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        if self.path == "/api/nhap":
            receipts = bamboo("GET", "/goods-receipts", user["tenant"])
            return self._send(200, {"imported": store().import_receipts(user["tenant"], receipts, user["name"])})
        if self.path == "/api/xuat":
            try:
                quantity = float(data.get("quantity") or 0)
                remaining = store().issue(
                    user["tenant"], str(data.get("warehouse_id")), str(data.get("item_code")), quantity,
                    str(data.get("ref") or ""), user["name"],
                )  # fmt: skip
            except (StockError, ValueError) as exc:
                return self._send(400, {"message": str(exc)})
            if remaining < MIN_STOCK and data.get("owner"):
                bamboo(
                    "POST",
                    "/notifications",
                    user["tenant"],
                    {
                        "person_id": data["owner"],
                        "title": f"Tồn kho thấp: {data.get('item_code')} còn {remaining:g}",
                        "body": f"{user['name']} vừa xuất {quantity:g}. Mức tối thiểu {MIN_STOCK:g}.",
                    },
                )
            return self._send(200, {"remaining": remaining})
        self._send(404, {"message": "not found"})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"Ứng dụng Kho hàng nghe cổng {port}, gọi Bamboo ở {BAMBOO_API}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
