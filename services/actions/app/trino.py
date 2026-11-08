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
