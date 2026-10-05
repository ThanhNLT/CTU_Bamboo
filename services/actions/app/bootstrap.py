# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Job khởi tạo chạy mỗi lần `docker compose up`: tạo bucket S3, deploy BPMN, nạp metadata Hasura,
tạo index và khóa API Meilisearch."""

import hashlib
import json
import logging
import pathlib
import sys
import time

import httpx

from . import config, keycloak_sync, search, storage
from .flowable import FlowableClient

log = logging.getLogger("bootstrap")
ROOT = pathlib.Path(__file__).resolve().parents[3]
BPMN = ROOT / "platform/flowable/purchase_request.bpmn20.xml"
METADATA = ROOT / "platform/hasura/metadata.json"


def wait_for(name: str, check, timeout: float = 300.0) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            check()
            return
        except Exception as exc:  # noqa: BLE001
            if time.monotonic() > deadline:
                raise RuntimeError(f"{name} chưa sẵn sàng: {exc}") from exc
            time.sleep(2)


def deploy_bpmn(flowable: FlowableClient, path: pathlib.Path = BPMN) -> bool:
    """Deploy khi nội dung đổi: tên deployment kèm sha256, không deploy trùng."""
    content = path.read_bytes()
    name = f"purchase_request-{hashlib.sha256(content).hexdigest()[:12]}"
    if flowable.deployments_named(name):
        return False
    flowable.deploy(name, path.name, content)
    log.info("đã deploy %s", name)
    return True


def apply_hasura_metadata(hasura_url: str, admin_secret: str, path: pathlib.Path = METADATA) -> None:
    metadata = json.loads(path.read_text(encoding="utf-8"))
    headers = {"x-hasura-admin-secret": admin_secret}
    with httpx.Client(base_url=hasura_url, headers=headers, timeout=60) as http:
        resp = http.post("/v1/metadata", json={"type": "replace_metadata", "version": 2,
                                               "args": {"allow_inconsistent_metadata": False, "metadata": metadata}})
        if resp.status_code >= 400:
            raise RuntimeError(f"Hasura từ chối metadata: {resp.text[:2000]}")
    log.info("đã nạp metadata Hasura")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    settings = config.load()
    wait_for("SeaweedFS", lambda: storage.ensure_buckets(settings))
    log.info("bucket S3 sẵn sàng: %s, %s", settings.s3_quarantine_bucket, settings.s3_documents_bucket)
    flowable = FlowableClient(settings.flowable_url, settings.flowable_user, settings.flowable_password)
    wait_for("Flowable", lambda: flowable.deployments_named("-"))
    deploy_bpmn(flowable)
    meili = search.Meili(settings.meili_url, settings.meili_master_key)
    wait_for("Meilisearch", lambda: meili.request("GET", "/health"))
    if search.ensure_index(meili, settings.meili_index):
        log.info("đã tạo index tìm kiếm %s", settings.meili_index)
    search.ensure_keys(meili)
    wait_for("Hasura", lambda: httpx.get(f"{settings.hasura_url}/healthz", timeout=5).raise_for_status())
    apply_hasura_metadata(settings.hasura_url, settings.hasura_admin_secret)
    wait_for("Keycloak", lambda: keycloak_sync.ensure_web_client(
        settings.keycloak_url, settings.keycloak_admin_user, settings.keycloak_admin_password,
        settings.web_origin))
    log.info("client %s chấp nhận %s", keycloak_sync.CLIENT_ID, settings.web_origin)
    return 0


if __name__ == "__main__":
    sys.exit(main())
