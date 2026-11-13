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

import ssl

import httpx

from . import config


class TrinoError(Exception):
    def __init__(self, message: str, name: str = ""):
        super().__init__(message)
        self.name = name


class Trino:
    def __init__(self, url: str, user: str, password: str = "", ca_file: str = "", timeout: float = 60):
        verify: ssl.SSLContext | bool = ssl.create_default_context(cafile=ca_file) if ca_file else True
        self.user = user
        self.http = httpx.Client(
            base_url=url,
            timeout=timeout,
            verify=verify,
            auth=(user, password) if password else None,
            headers={"X-Trino-Source": "bamboo-actions"},
        )

    def query(
        self, sql: str, *, as_user: str | None = None, catalog: str = "lakehouse", schema: str | None = None
    ) -> tuple[list[dict], list[list]]:
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
