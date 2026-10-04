# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Đồng bộ client `bms-web` của Keycloak với địa chỉ ứng dụng hiện tại (job bootstrap).

Keycloak chỉ import realm ở lần chạy đầu, nên khi địa chỉ ứng dụng đổi (nâng cấp 0.1.0 → 0.2.0
chuyển sang cổng API, hoặc đổi tên miền) client vẫn giữ redirect URI cũ và đăng nhập báo lỗi.
Mỗi lần khởi động, bootstrap bổ sung `WEB_ORIGIN` vào redirect URI, web origin và URI sau đăng
xuất nếu còn thiếu; không xóa giá trị có sẵn, không đụng dữ liệu khác. Chạy lại bao nhiêu lần
cũng cho cùng kết quả.
"""

import logging

import httpx

log = logging.getLogger("keycloak_sync")

REALM = "bms"
CLIENT_ID = "bms-web"


def admin_token(base_url: str, user: str, password: str) -> str:
    resp = httpx.post(f"{base_url}/realms/master/protocol/openid-connect/token", timeout=15,
                      data={"grant_type": "password", "client_id": "admin-cli",
                            "username": user, "password": password})
    resp.raise_for_status()
    return resp.json()["access_token"]


def desired_changes(client: dict, web_origin: str) -> dict:
    """Các trường cần cập nhật để client chấp nhận `web_origin` (rỗng nếu đã đủ)."""
    origin = web_origin.rstrip("/")
    changes = {}
    redirects = list(client.get("redirectUris") or [])
    if f"{origin}/*" not in redirects:
        changes["redirectUris"] = [*redirects, f"{origin}/*"]
    origins = list(client.get("webOrigins") or [])
    if origin not in origins and "+" not in origins:
        changes["webOrigins"] = [*origins, origin]
    attrs = dict(client.get("attributes") or {})
    logout = [u for u in (attrs.get("post.logout.redirect.uris") or "").split("##") if u]
    if f"{origin}/*" not in logout and "+" not in logout:
        attrs["post.logout.redirect.uris"] = "##".join([*logout, f"{origin}/*"])
        changes["attributes"] = attrs
    return changes


def ensure_web_client(base_url: str, user: str, password: str, web_origin: str) -> bool:
    """Trả về True nếu đã cập nhật client, False nếu không cần."""
    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {admin_token(base_url, user, password)}"}
    with httpx.Client(base_url=f"{base_url}/admin/realms/{REALM}", headers=headers, timeout=15) as http:
        found = http.get("/clients", params={"clientId": CLIENT_ID})
        found.raise_for_status()
        if not found.json():
            raise RuntimeError(f"Không có client {CLIENT_ID} trong realm {REALM}")
        client = found.json()[0]
        changes = desired_changes(client, web_origin)
        if not changes:
            return False
        http.put(f"/clients/{client['id']}", json={**client, **changes}).raise_for_status()
    log.info("đã bổ sung %s vào client %s: %s", web_origin, CLIENT_ID, ", ".join(changes))
    return True
