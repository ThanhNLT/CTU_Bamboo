# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Client REST tối thiểu cho Flowable (chỉ dịch vụ actions gọi Flowable)."""

# ===== Thư viện bên ngoài =====
import httpx  # HTTPX


# ===== Lớp =====
class FlowableClient:
    def __init__(self, base_url: str, user: str, password: str, timeout: float = 15.0):
        self.http = httpx.Client(base_url=base_url.rstrip("/") + "/", auth=(user, password), timeout=timeout)

    def close(self) -> None:
        self.http.close()

    def _check(self, resp: httpx.Response) -> httpx.Response:
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Flowable {resp.request.method} {resp.request.url.path}: {resp.status_code} {resp.text[:300]}"
            )
        return resp

    # ===== Triển khai quy trình =====

    def deployments_named(self, name: str) -> list[dict]:
        return self._check(self.http.get("repository/deployments", params={"name": name})).json()["data"]

    def deploy(self, name: str, filename: str, content: bytes) -> dict:
        resp = self.http.post(
            "repository/deployments", params={"deploymentName": name}, files={"file": (filename, content, "text/xml")}
        )
        return self._check(resp).json()

    # ===== Tiến trình =====

    def start_process(self, key: str, business_key: str, variables: dict) -> str:
        body = {
            "processDefinitionKey": key,
            "businessKey": business_key,
            "variables": [{"name": k, "value": v} for k, v in variables.items()],
        }
        return self._check(self.http.post("runtime/process-instances", json=body)).json()["id"]

    def find_process(self, key: str, business_key: str) -> dict | None:
        """Tiến trình (đang chạy hoặc đã kết thúc) theo business key."""
        resp = self._check(
            self.http.get(
                "history/historic-process-instances", params={"processDefinitionKey": key, "businessKey": business_key}
            )
        )
        data = resp.json()["data"]
        return data[0] if data else None

    def process_running(self, process_id: str) -> bool:
        resp = self.http.get(f"runtime/process-instances/{process_id}")
        if resp.status_code == 404:
            return False
        self._check(resp)
        return True

    def delete_process(self, process_id: str, reason: str) -> None:
        resp = self.http.delete(f"runtime/process-instances/{process_id}", params={"deleteReason": reason})
        if resp.status_code != 404:
            self._check(resp)

    def variable(self, process_id: str, name: str):
        resp = self._check(self.http.get(f"runtime/process-instances/{process_id}/variables/{name}"))
        return resp.json()["value"]

    def historic_activities(self, process_id: str) -> list[dict]:
        """Các bước đã đi qua và đang đứng (endTime rỗng), theo thứ tự thời gian."""
        resp = self._check(
            self.http.get(
                "history/historic-activity-instances",
                params={"processInstanceId": process_id, "sort": "startTime", "order": "asc", "size": 1000},
            )
        )
        return resp.json()["data"]

    def process_definition_xml(self, definition_id: str) -> str:
        return self._check(self.http.get(f"repository/process-definitions/{definition_id}/resourcedata")).text

    # ===== User task =====

    def tasks(self, process_id: str) -> list[dict]:
        return self._check(self.http.get("runtime/tasks", params={"processInstanceId": process_id})).json()["data"]

    def set_assignee(self, task_id: str, assignee: str | None) -> None:
        if assignee is None:
            self._check(self.http.post(f"runtime/tasks/{task_id}", json={"action": "claim", "assignee": None}))
        else:
            self._check(self.http.put(f"runtime/tasks/{task_id}", json={"assignee": assignee}))

    def complete(self, task_id: str, variables: dict) -> None:
        body = {"action": "complete", "variables": [{"name": k, "value": v} for k, v in variables.items()]}
        self._check(self.http.post(f"runtime/tasks/{task_id}", json=body))
