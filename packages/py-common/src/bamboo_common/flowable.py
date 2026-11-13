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

import httpx


class FlowableClient:
    def __init__(self, base_url: str, user: str, password: str, timeout: float = 15.0):
        self.http = httpx.Client(base_url=base_url.rstrip("/") + "/", auth=(user, password), timeout=timeout)
        external = base_url.rstrip("/").removesuffix("/service") + "/external-job-api/"
        self.ext = httpx.Client(base_url=external, auth=(user, password), timeout=timeout)

    def close(self) -> None:
        self.http.close()
        self.ext.close()

    def _check(self, resp: httpx.Response) -> httpx.Response:
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Flowable {resp.request.method} {resp.request.url.path}: {resp.status_code} {resp.text[:300]}"
            )
        return resp

    def deployments_named(self, name: str) -> list[dict]:
        return self._check(self.http.get("repository/deployments", params={"name": name})).json()["data"]

    def deploy(self, name: str, filename: str, content: bytes) -> dict:
        resp = self.http.post(
            "repository/deployments", params={"deploymentName": name}, files={"file": (filename, content, "text/xml")}
        )
        return self._check(resp).json()

    def delete_deployment(self, deployment_id: str) -> None:
        resp = self.http.delete(f"repository/deployments/{deployment_id}", params={"cascade": "true"})
        if resp.status_code != 404:
            self._check(resp)

    def definitions_of(self, deployment_id: str) -> list[dict]:
        return self._check(
            self.http.get("repository/process-definitions", params={"deploymentId": deployment_id})
        ).json()["data"]

    def start_definition(self, definition_id: str, variables: dict) -> str:
        body = {
            "processDefinitionId": definition_id,
            "variables": [{"name": k, "value": v} for k, v in variables.items()],
        }
        return self._check(self.http.post("runtime/process-instances", json=body)).json()["id"]

    def start_process(self, key: str, business_key: str, variables: dict) -> str:
        body = {
            "processDefinitionKey": key,
            "businessKey": business_key,
            "variables": [{"name": k, "value": v} for k, v in variables.items()],
        }
        return self._check(self.http.post("runtime/process-instances", json=body)).json()["id"]

    def find_process(self, key: str, business_key: str) -> dict | None:
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
        resp = self._check(
            self.http.get(
                "history/historic-activity-instances",
                params={"processInstanceId": process_id, "sort": "startTime", "order": "asc", "size": 1000},
            )
        )
        return resp.json()["data"]

    def process_definition_xml(self, definition_id: str) -> str:
        return self._check(self.http.get(f"repository/process-definitions/{definition_id}/resourcedata")).text

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

    WORKER = "bamboo-automation"

    def external_acquire(self, topic: str, limit: int = 20, lock: str = "PT2M") -> list[dict]:
        body = {
            "topic": topic,
            "lockDuration": lock,
            "numberOfTasks": limit,
            "numberOfRetries": 3,
            "workerId": self.WORKER,
        }
        return self._check(self.ext.post("acquire/jobs", json=body)).json()

    def external_complete(self, job_id: str, variables: dict | None = None) -> None:
        body = {
            "workerId": self.WORKER,
            "variables": [{"name": k, "value": v} for k, v in (variables or {}).items()],
        }
        self._check(self.ext.post(f"acquire/jobs/{job_id}/complete", json=body))

    def external_fail(self, job_id: str, message: str, retries: int) -> None:
        body = {"workerId": self.WORKER, "errorMessage": message[:500], "retries": retries, "retryTimeout": "PT30S"}
        self._check(self.ext.post(f"acquire/jobs/{job_id}/fail", json=body))
