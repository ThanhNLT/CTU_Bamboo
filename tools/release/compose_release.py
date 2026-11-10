# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

import json
import os
import pathlib
import subprocess
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
TAG_VAR = "${BAMBOO_TAG:-dev}"
DOCKER_SOCK = "/var/run/docker.sock"


def build(version: str) -> dict:
    compose = os.environ.get("DOCKER_COMPOSE", "docker compose").split()
    raw = subprocess.run(
        [*compose, "--profile", "scan", "config", "--no-interpolate", "--format", "json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    spec = json.loads(raw)
    services = {}
    for name, svc in spec["services"].items():
        if "test" in svc.get("profiles", []):
            continue
        svc.pop("build", None)
        svc["image"] = svc["image"].replace(TAG_VAR, "${BAMBOO_TAG:-%s}" % version)
        binds = [
            v.get("source")
            for v in svc.get("volumes", [])
            if v.get("type") == "bind" and v.get("source") != DOCKER_SOCK
        ]
        if binds:
            raise SystemExit(f"Dịch vụ {name} còn bind mount {binds}: đóng gói vào image trước khi phát hành")
        for dep in list(svc.get("depends_on", {})):
            if "test" in spec["services"].get(dep, {}).get("profiles", []):
                del svc["depends_on"][dep]
        services[name] = svc
    volumes = {k: {} for k in spec.get("volumes", {})}
    return {"name": spec.get("name", "bamboo"), "services": services, "volumes": volumes}


def main() -> None:
    version = sys.argv[1]
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "compose.release.yml"
    header = (
        "# Bamboo - DX-OS Open-Core\n"
        f"# @version {version}\n"
        "# @author CTUBamboo\n"
        "# @copyright Copyright 2026 Bamboo\n"
        "# @license Apache-2.0\n"
        "# @see https://github.com/CTUBamboo/Bamboo, Bamboo project\n"
        "\n"
        f"# Bamboo DX-OS {version}: toàn bộ hệ thống từ image dựng sẵn, không cần mã nguồn.\n"
        "#   docker compose -f compose.release.yml up -d\n"
        "# Sinh tự động bằng tools/release/compose_release.py; đừng sửa tay.\n"
    )
    body = yaml.safe_dump(build(version), allow_unicode=True, sort_keys=False, width=120)
    out.write_text(header + body, encoding="utf-8")
    print(f"đã ghi {out}")


if __name__ == "__main__":
    main()
