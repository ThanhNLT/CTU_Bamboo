# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Client REST tối giản của Trino (ADR #40, #45): POST /v1/statement rồi theo nextUri.

Đăng nhập bằng tài khoản dịch vụ qua HTTPS (chứng chỉ do CA nội bộ của OpenBao cấp). `as_user` đặt người dùng
của phiên khác tài khoản đăng nhập (impersonation): actions chỉ được mượn danh người dùng tenant `t_<tenant_id>`,
quyền và row filter của Trino áp theo người dùng đó (platform/trino/rules.json).
"""

import ssl

import httpx

from . import config


class TrinoError(Exception):
    def __init__(self, message: str, name: str = ""):
        super().__init__(message)
        self.name = name  # errorName của Trino, ví dụ PERMISSION_DENIED, TABLE_NOT_FOUND


class Trino:
    def __init__(self, url: str, user: str, password: str = "", ca_file: str = "", timeout: float = 60):
        verify: ssl.SSLContext | bool = ssl.create_default_context(cafile=ca_file) if ca_file else True
        self.user = user
        self.http = httpx.Client(base_url=url, timeout=timeout, verify=verify,
                                 auth=(user, password) if password else None,
                                 headers={"X-Trino-Source": "bamboo-actions"})

    def query(self, sql: str, *, as_user: str | None = None, catalog: str = "lakehouse",
              schema: str | None = None) -> tuple[list[dict], list[list]]:
        """(cột [{name, type}], các dòng). Lỗi truy vấn hoặc quyền: TrinoError."""
        headers = {"X-Trino-User": as_user or self.user, "X-Trino-Catalog": catalog}
        if schema:
            headers["X-Trino-Schema"] = schema
        resp = self._json(self.http.post("/v1/statement", content=sql, headers=headers))
        columns, rows = [], []
        while True:
            if "error" in resp:
                error = resp["error"]
                raise TrinoError(error.get("message", "lỗi Trino"), error.get("errorName", ""))
            columns = columns or [{"name": c["name"], "type": c["type"]} for c in resp.get("columns", [])]
            rows += resp.get("data", [])
            if "nextUri" not in resp:
                return columns, rows
            resp = self._json(self.http.get(resp["nextUri"], headers=headers))

    @staticmethod
    def _json(resp: httpx.Response) -> dict:
        if resp.status_code == 401:
            raise TrinoError("Trino từ chối đăng nhập", "UNAUTHENTICATED")
        resp.raise_for_status()
        return resp.json()

    def close(self) -> None:
        self.http.close()


def client(settings: config.Settings) -> Trino:
    return Trino(settings.trino_url, settings.trino_user, settings.trino_password, settings.trino_ca_file)
