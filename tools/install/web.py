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

"""Phục vụ bản dựng tĩnh của giao diện (lệnh `bamboo web`) để chạy thử bản cài ngoài thư mục mã nguồn.

Đường dẫn không khớp tệp nào thì trả `index.html` (ứng dụng một trang). `/config.js` sinh từ biến môi trường
`BAMBOO_KEYCLOAK_URL`, `BAMBOO_KEYCLOAK_REALM`, `BAMBOO_KEYCLOAK_CLIENT`, `BAMBOO_HASURA_URL`, `BAMBOO_SETUP_URL`,
`BAMBOO_EXT_URL` nên đổi địa chỉ dịch vụ không cần dựng lại giao diện. Chỉ dùng thư viện chuẩn; triển khai thật
dùng nginx (`apps/web/nginx.conf`) hoặc web server tương đương.
"""

import argparse
import functools
import http.server
import io
import json
import os
import pathlib

RUNTIME_KEYS = {
    "keycloakUrl": "BAMBOO_KEYCLOAK_URL",
    "keycloakRealm": "BAMBOO_KEYCLOAK_REALM",
    "keycloakClient": "BAMBOO_KEYCLOAK_CLIENT",
    "hasuraUrl": "BAMBOO_HASURA_URL",
    "setupUrl": "BAMBOO_SETUP_URL",
    "extUrl": "BAMBOO_EXT_URL",
}


def runtime_config(environ: dict[str, str]) -> bytes:
    values = {key: environ[name] for key, name in RUNTIME_KEYS.items() if environ.get(name, "").strip()}
    body = json.dumps(values, ensure_ascii=False, indent=2).replace("<", "\\u003c")
    return f"window.__BAMBOO_CONFIG__ = {body};\n".encode()


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        route = self.path.split("?", 1)[0].split("#", 1)[0]
        if route == "/config.js":
            body = runtime_config(dict(os.environ))
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return io.BytesIO(body)
        target = pathlib.Path(self.translate_path(self.path))
        if not target.is_file() and not pathlib.PurePosixPath(route).suffix:
            self.path = "/index.html"
        return super().send_head()


def main() -> None:
    parser = argparse.ArgumentParser(description="Phục vụ giao diện Bamboo đã dựng")
    parser.add_argument("--root", required=True, help="thư mục chứa index.html")
    parser.add_argument("--host", default=os.environ.get("WEB_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("WEB_PORT", "5173")))
    args = parser.parse_args()
    root = pathlib.Path(args.root).resolve()
    if not (root / "index.html").is_file():
        raise SystemExit(f"không thấy index.html trong {root}")
    handler = functools.partial(Handler, directory=str(root))
    with http.server.ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f"Giao diện Bamboo: http://{args.host}:{args.port} (thư mục {root})", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
