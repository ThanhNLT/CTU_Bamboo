"""Job khởi tạo chạy mỗi lần `docker compose up`: deploy BPMN, nạp metadata Hasura."""

import hashlib
import json
import logging
import pathlib
import sys
import time

import httpx

from . import config
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
    flowable = FlowableClient(settings.flowable_url, settings.flowable_user, settings.flowable_password)
    wait_for("Flowable", lambda: flowable.deployments_named("-"))
    deploy_bpmn(flowable)
    wait_for("Hasura", lambda: httpx.get(f"{settings.hasura_url}/healthz", timeout=5).raise_for_status())
    apply_hasura_metadata(settings.hasura_url, settings.hasura_admin_secret)
    return 0


if __name__ == "__main__":
    sys.exit(main())
