# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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
import re
import subprocess
import sys
import tempfile

import yaml

ROOT = pathlib.Path(os.environ.get("BAMBOO_ROOT") or pathlib.Path(__file__).resolve().parents[2]).resolve()
TAG_VAR = "${BAMBOO_TAG:-dev}"
PULL_VAR = "${BAMBOO_PULL_POLICY:-build}"
DOCKER_SOCK = "/var/run/docker.sock"


def compose_config() -> dict:
    """Cấu hình compose chưa thay biến. Docker Compose kiểm schema cả khi --no-interpolate nên từ chối
    `pull_policy: ${BAMBOO_PULL_POLICY:-build}`: đọc bản chép ở thư mục tạm, biến đó thay bằng `build`. Thư mục tạm
    không có .env nên giá trị của máy dựng không lọt vào tệp phát hành."""
    compose = os.environ.get("DOCKER_COMPOSE", "docker compose").split()
    with tempfile.TemporaryDirectory() as tmp:
        for src in [ROOT / "compose.yaml", *sorted((ROOT / "infra/compose").glob("*.yml"))]:
            dst = pathlib.Path(tmp) / src.relative_to(ROOT)
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(src.read_text(encoding="utf-8").replace(PULL_VAR, "build"), encoding="utf-8")
        raw = subprocess.run(
            [*compose, "--profile", "scan", "config", "--no-interpolate", "--format", "json"],
            cwd=tmp,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    # Đường dẫn bind mount trỏ vào thư mục tạm (macOS: /var là liên kết tới /private/var): trả về đường trong kho mã.
    for prefix in sorted({os.path.realpath(tmp), tmp}, key=len, reverse=True):
        raw = raw.replace(json.dumps(prefix)[1:-1], json.dumps(str(ROOT))[1:-1])
    return json.loads(raw)


def build(version: str) -> dict:
    spec = compose_config()
    services, configs = {}, {}
    for name, svc in spec["services"].items():
        if "test" in svc.get("profiles", []):
            continue
        if svc.pop("build", None) is not None and svc.get("pull_policy") == "build":
            svc["pull_policy"] = "${BAMBOO_PULL_POLICY:-missing}"
        svc["image"] = svc["image"].replace(TAG_VAR, "${BAMBOO_TAG:-%s}" % version)
        inline_binds(name, svc, configs)
        for dep in list(svc.get("depends_on", {})):
            if "test" in spec["services"].get(dep, {}).get("profiles", []):
                del svc["depends_on"][dep]
        services[name] = svc
    volumes = {k: {} for k in spec.get("volumes", {})}
    out = {"name": spec.get("name", "bamboo"), "services": services, "volumes": volumes}
    if configs:
        out["configs"] = configs
    return out


def inline_binds(name: str, svc: dict, configs: dict) -> None:
    """Tệp cấu hình gắn từ kho mã (bind mount, ví dụ Prometheus, Grafana) thành `configs` có nội dung viết thẳng trong
    tệp phát hành, để chạy không cần mã nguồn. Compose thay biến trong `content`, nên `$` viết thành `$$`."""
    keep, mounts = [], []
    for vol in svc.get("volumes", []):
        if vol.get("type") != "bind" or vol.get("source") == DOCKER_SOCK:
            keep.append(vol)
            continue
        src = pathlib.Path(vol["source"])
        if not src.is_relative_to(ROOT) or not src.exists():
            raise SystemExit(f"Dịch vụ {name} gắn {src} nằm ngoài kho mã: đóng gói vào image trước khi phát hành")
        files = [src] if src.is_file() else sorted(p for p in src.rglob("*") if p.is_file() and p.name[0] != ".")
        for f in files:
            key = re.sub(r"[^A-Za-z0-9]+", "-", f"{name}-{f.relative_to(ROOT)}").strip("-")
            configs[key] = {"content": f.read_text(encoding="utf-8").replace("$", "$$")}
            target = vol["target"] if f == src else f"{vol['target']}/{f.relative_to(src).as_posix()}"
            mounts.append({"source": key, "target": target})
    if mounts:
        svc["volumes"] = keep
        if not keep:
            del svc["volumes"]
        svc["configs"] = [*svc.get("configs", []), *mounts]


def main() -> None:
    version = sys.argv[1]
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "compose.release.yml"
    lines = (ROOT / "docs/Header.txt").read_text(encoding="utf-8").strip("\n").splitlines()
    lines = [f"@version {version}" if x.startswith("@version ") else x for x in lines]
    header = (
        "".join(f"# {x}".rstrip() + "\n" for x in lines) + "\n"
        f"# Bamboo {version}: toàn bộ hệ thống từ image dựng sẵn, không cần mã nguồn.\n"
        "#   docker compose -f compose.release.yml up -d\n"
        "# Sinh tự động bằng tools/release/compose_release.py; đừng sửa tay.\n"
    )
    body = yaml.safe_dump(build(version), allow_unicode=True, sort_keys=False, width=120)
    out.write_text(header + body, encoding="utf-8")
    print(f"đã ghi {out}")


if __name__ == "__main__":
    main()
