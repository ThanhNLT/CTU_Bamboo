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
    lines = (ROOT / "docs/Header.txt").read_text(encoding="utf-8").strip("\n").splitlines()
    lines = [f"@version {version}" if x.startswith("@version ") else x for x in lines]
    header = (
        "".join(f"# {x}".rstrip() + "\n" for x in lines) + "\n"
        f"# Bamboo DX-OS {version}: toàn bộ hệ thống từ image dựng sẵn, không cần mã nguồn.\n"
        "#   docker compose -f compose.release.yml up -d\n"
        "# Sinh tự động bằng tools/release/compose_release.py; đừng sửa tay.\n"
    )
    body = yaml.safe_dump(build(version), allow_unicode=True, sort_keys=False, width=120)
    out.write_text(header + body, encoding="utf-8")
    print(f"đã ghi {out}")


if __name__ == "__main__":
    main()
