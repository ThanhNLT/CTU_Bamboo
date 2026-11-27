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

"""Sinh manifest Kubernetes (Kustomize) từ cấu hình Docker Compose cho k3s và Argo CD (ADR #95).

    python tools/k8s/generate.py            ghi infra/k8s/base/ và infra/k8s/overlays/ci/settings.env
    python tools/k8s/generate.py --check    thoát 1 nếu tệp đã sinh lệch với compose (CI dùng)

Compose vẫn là nguồn sự thật: cấu hình đi qua tools/release/compose_release.py (image dựng sẵn, tệp gắn từ kho mã đã
viết thẳng thành `configs`), rồi mỗi dịch vụ thành Deployment (hoặc Job với dịch vụ chạy một lần), Service, PVC cho
volume có tên, ConfigMap cho `configs`. Biến `${TÊN:-mặc định}` của compose thành biến lấy từ Secret `bamboo-settings`
(Kubernetes thay `$(TÊN)` trong env, command); overlay ci sinh Secret đó từ giá trị mặc định của môi trường dev,
production tự tạo (xem infra/k8s/README.md). `depends_on` thành init container chờ Job xong (kubectl wait) hoặc chờ
Service có pod sẵn sàng (nc). Không đưa sang: dịch vụ cần Docker API (sleeper, vector) và nhóm kiểm thử.
"""

import argparse
import difflib
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/release"))
import compose_release  # noqa: E402

BASE = ROOT / "infra/k8s/base"
COMPONENTS = ROOT / "infra/k8s/components"
CI_SETTINGS = ROOT / "infra/k8s/overlays/ci/settings.env"
NAMESPACE = "bamboo"
SETTINGS_SECRET = "bamboo-settings"
# Biến phụ mang giá trị cài đặt để Kubernetes thay `$(...)` trong chuỗi ghép, không che biến cùng tên của ứng dụng.
HELPER = "_BAMBOO_"
KUBECTL_IMAGE = "registry.k8s.io/kubectl:v1.37.2"
BUSYBOX_IMAGE = "busybox:1.37.0"
VERSION = "0.5.2"
SKIP_PROFILES = {"test"}
# Cần Docker API (bật/tắt container, đọc log container): không có tương đương trong cụm.
SKIP_SERVICES = {"sleeper", "vector"}
# Cổng dịch vụ trong mạng nội bộ (compose không khai báo cổng không mở ra máy).
PORTS = {
    "actions": [8000],
    "db": [5432],
    "debezium": [8080],
    "flowable": [8080],
    "gateway": [9080, 9091],
    "gotenberg-core": [3000],
    "grafana": [3000],
    "hasura": [8080],
    "jaeger": [16686, 4317],
    "kafka": [9092, 19092],
    "keycloak": [8080, 9000],
    "mailpit": [1025, 8025],
    "meilisearch": [7700],
    "mosquitto": [1883, 8883, 8884],
    "ocr-core": [8000],
    "ollama-core": [11434],
    "openbao": [8200],
    "otel-collector": [4317, 4318, 8888],
    "prometheus": [9090],
    "seaweedfs": [8333, 9333, 19333, 8080, 18080, 8888, 18888],
    "tika-core": [9998],
    "trino-core": [8443],
    "web": [8080],
    "clamav": [3310],
}
# sleeper đứng giữa với tên trino, tika, gotenberg, ollama, ocr và đánh thức dịch vụ khi có yêu cầu; trong cụm các dịch
# vụ đó chạy thường trực, tên cũ thành Service trỏ thẳng vào chúng.
ALIASES = {"trino": "trino-core", "tika": "tika-core", "gotenberg": "gotenberg-core", "ollama": "ollama-core",
           "ocr": "ocr-core"}  # fmt: skip
# Bỏ biến chỉ có nghĩa khi có sleeper.
DROP_ENV = {"SLEEPER_URL"}
# Image chạy bằng người dùng không phải root nhưng PVC mới tạo thuộc root: fsGroup cho volume nhóm của người dùng đó.
# OpenBao (uid 100, gid 1000) bỏ bước chown của entrypoint, vốn thất bại khi không chạy bằng root và làm container dừng.
POD_SECURITY = {"openbao": {"fsGroup": 1000, "fsGroupChangePolicy": "OnRootMismatch"}}
EXTRA_ENV = {"openbao": {"SKIP_CHOWN": "true"}}
VOLUME_SIZES = {"pgdata": "20Gi", "seaweedfs-data": "50Gi", "backups": "50Gi", "ollama-models": "20Gi",
                "ocr-models": "5Gi", "kafka-data": "10Gi", "meilisearch-data": "5Gi", "prometheus-data": "5Gi"}  # fmt: skip

_VAR = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?])((?:[^{}]|\{[^{}]*\})*))?\}")


def resolve_default(text: str) -> str:
    """Giá trị mặc định của biểu thức compose (biến lồng nhau lấy mặc định của chúng)."""
    return _VAR.sub(lambda m: resolve_default(m.group(3) or ""), text.replace("$$", "\x00")).replace("\x00", "$")


def k8s_expand(text: str, refs: dict[str, str]) -> str:
    """`${A:-x}` thành `$(A)` (Kubernetes thay bằng biến môi trường của container), ghi A và mặc định vào refs."""

    def sub(m: re.Match) -> str:
        refs.setdefault(m.group(1), resolve_default(m.group(3) or ""))
        return f"$({HELPER}{m.group(1)})"

    return _VAR.sub(sub, text.replace("$$", "\x00")).replace("\x00", "$")


def _seconds(value, default: int) -> int:
    if not value:
        return default
    total, number = 0, ""
    for ch in str(value):
        if ch.isdigit():
            number += ch
        elif number:
            total += int(number) * {"h": 3600, "m": 60, "s": 1}.get(ch, 0)
            number = ""
    return max(1, total + (int(number) if number else 0))


def _labels(name: str) -> dict:
    return {"app.kubernetes.io/name": name, "app.kubernetes.io/part-of": "bamboo"}


def _command(value, refs) -> list[str] | None:
    if value is None:
        return None
    items = value if isinstance(value, list) else ["sh", "-c", value]
    return [k8s_expand(str(x), refs) for x in items]


def _probe(healthcheck: dict | None) -> dict | None:
    if not healthcheck or healthcheck.get("disable"):
        return None
    test = healthcheck.get("test")
    if not test or test[0] == "NONE":
        return None
    cmd = test[1:] if test[0] == "CMD" else ["sh", "-c", test[1]] if test[0] == "CMD-SHELL" else test
    return {
        "exec": {"command": [str(x).replace("$$", "$") for x in cmd]},
        "periodSeconds": min(_seconds(healthcheck.get("interval"), 30), 10),
        "timeoutSeconds": _seconds(healthcheck.get("timeout"), 5),
        "failureThreshold": 3,
    }


def _security(svc: dict) -> dict:
    ctx: dict = {}
    user = str(svc.get("user", "") or "")
    if user:
        uid, _, gid = user.partition(":")
        if uid.isdigit():
            ctx["runAsUser"] = int(uid)
            if gid.isdigit():
                ctx["runAsGroup"] = int(gid)
    if svc.get("read_only"):
        ctx["readOnlyRootFilesystem"] = True
    if "ALL" in (svc.get("cap_drop") or []):
        ctx["capabilities"] = {"drop": ["ALL"]}
    if any("no-new-privileges" in s for s in svc.get("security_opt") or []):
        ctx["allowPrivilegeEscalation"] = False
    return ctx


def _wait_containers(name: str, svc: dict, jobs: set[str], services: dict) -> list[dict]:
    out = []
    for dep, cond in sorted((svc.get("depends_on") or {}).items()):
        if dep in SKIP_SERVICES or dep not in services:
            continue
        condition = cond.get("condition") if isinstance(cond, dict) else "service_started"
        if dep in jobs or condition == "service_completed_successfully":
            out.append({
                "name": f"wait-{dep}",
                "image": KUBECTL_IMAGE,
                "args": ["wait", "--for=condition=complete", f"job/{dep}", "--timeout=3600s"],
            })  # fmt: skip
        elif PORTS.get(dep):
            port = PORTS[dep][0]
            out.append({
                "name": f"wait-{dep}",
                "image": BUSYBOX_IMAGE,
                "command": ["sh", "-c", f"until nc -z -w 2 {dep} {port}; do sleep 2; done"],
            })  # fmt: skip
    return out


def _secret_env(name: str, key: str) -> dict:
    return {"name": name, "valueFrom": {"secretKeyRef": {"name": SETTINGS_SECRET, "key": key, "optional": True}}}


def _env(svc: dict, command_refs: dict[str, str]) -> tuple[list[dict], dict[str, str]]:
    """Biến môi trường. `TÊN: ${TÊN:-x}` lấy thẳng từ Secret bamboo-settings; giá trị ghép và command dùng biến phụ
    `_BAMBOO_TÊN` khai báo trước để `$(...)` thay được. Trả (env, các cài đặt dùng tới kèm giá trị mặc định)."""
    env = svc.get("environment") or {}
    if isinstance(env, list):
        env = dict(item.split("=", 1) for item in env)
    used: dict[str, str] = dict(command_refs)
    helpers: dict[str, str] = dict(command_refs)
    direct, plain = [], []
    for key, value in env.items():
        if key in DROP_ENV:
            continue
        text = "" if value is None else str(value).lower() if isinstance(value, bool) else str(value)
        m = _VAR.fullmatch(text)
        if m and m.group(1) == key:
            used.setdefault(key, resolve_default(m.group(3) or ""))
            direct.append(_secret_env(key, key))
            continue
        plain.append({"name": key, "value": k8s_expand(text, helpers)})
    used.update({k: v for k, v in helpers.items() if k not in used})
    return [_secret_env(f"{HELPER}{k}", k) for k in sorted(helpers)] + direct + plain, used


def build(version: str = VERSION):
    spec = compose_release.build(version)
    services = {
        n: s
        for n, s in spec["services"].items()
        if n not in SKIP_SERVICES and not set(s.get("profiles", [])) & SKIP_PROFILES
    }
    jobs = {n for n, s in services.items() if str(s.get("restart", "")) in ("no", "False", "false")}
    configs = spec.get("configs", {})
    docs: dict[str, list[dict]] = {}
    settings: dict[str, str] = {}
    # Dịch vụ thuộc nhóm tùy chọn của compose (observability, scan...) thành Kustomize component cùng tên nhóm.
    groups = {n: (s.get("profiles") or [""])[0] for n, s in services.items()}
    volumes: set[str] = set()

    for name, svc in sorted(services.items()):
        refs: dict[str, str] = {}
        command = _command(svc.get("entrypoint"), refs)
        args = _command(svc.get("command"), refs)
        env, used = _env(svc, refs)
        for key, default in used.items():
            if key in settings and settings[key] != default:
                print(
                    f"cảnh báo: {key} có mặc định khác nhau ({settings[key]!r}, {default!r} ở {name})", file=sys.stderr
                )
            settings.setdefault(key, default)

        mounts, pod_volumes = [], []
        for vol in svc.get("volumes") or []:
            if vol.get("type") == "volume":
                volumes.add(vol["source"])
                pod_volumes.append({"name": vol["source"], "persistentVolumeClaim": {"claimName": vol["source"]}})
                mounts.append(
                    {"name": vol["source"], "mountPath": vol["target"], "readOnly": bool(vol.get("read_only"))}
                )
            elif vol.get("type") == "tmpfs":
                vname = re.sub(r"[^a-z0-9]+", "-", vol["target"].lower()).strip("-") or "tmp"
                pod_volumes.append({"name": vname, "emptyDir": {"medium": "Memory"}})
                mounts.append({"name": vname, "mountPath": vol["target"]})
        for tmp in svc.get("tmpfs") or []:
            target = tmp.split(":")[0]
            vname = "tmpfs-" + (re.sub(r"[^a-z0-9]+", "-", target.lower()).strip("-") or "tmp")
            pod_volumes.append({"name": vname, "emptyDir": {"medium": "Memory"}})
            mounts.append({"name": vname, "mountPath": target})
        for cfg in svc.get("configs") or []:
            cm = f"{cfg['source']}"[:63].strip("-")
            pod_volumes.append({"name": cm, "configMap": {"name": cm}})
            mounts.append({"name": cm, "mountPath": cfg["target"], "subPath": "content", "readOnly": True})
            docs.setdefault(_group_file(groups[name], "configmaps"), []).append({
                "apiVersion": "v1", "kind": "ConfigMap", "metadata": {"name": cm, "labels": _labels(name)},
                "data": {"content": configs[cfg["source"]]["content"].replace("$$", "$")},
            })  # fmt: skip
        pod_volumes = list({v["name"]: v for v in pod_volumes}.values())

        container = {"name": name, "image": svc["image"].replace("${BAMBOO_TAG:-%s}" % version, version)}
        container["image"] = k8s_image(container["image"])
        if command:
            container["command"] = command
        if args:
            container["args"] = args
        env = env + [{"name": k, "value": v} for k, v in EXTRA_ENV.get(name, {}).items()]
        if env:
            container["env"] = env
        if PORTS.get(name):
            container["ports"] = [{"containerPort": p} for p in PORTS[name]]
        probe = _probe(svc.get("healthcheck"))
        if probe and name not in jobs:
            container["readinessProbe"] = probe
        if mounts:
            container["volumeMounts"] = mounts
        if svc.get("mem_limit"):
            container["resources"] = {"limits": {"memory": _memory(svc["mem_limit"])}}
        security = _security(svc)
        if security:
            container["securityContext"] = security
        if svc.get("working_dir"):
            container["workingDir"] = svc["working_dir"]

        pod = {
            "serviceAccountName": "bamboo",
            "enableServiceLinks": False,
            "containers": [container],
        }
        if POD_SECURITY.get(name):
            pod["securityContext"] = POD_SECURITY[name]
        waits = _wait_containers(name, svc, jobs, services)
        if waits:
            pod["initContainers"] = waits
        if pod_volumes:
            pod["volumes"] = pod_volumes
        meta = {"name": name, "labels": _labels(name)}
        if name in jobs:
            pod["restartPolicy"] = "OnFailure"
            meta["annotations"] = {"argocd.argoproj.io/sync-options": "Replace=true"}
            docs[name] = [{
                "apiVersion": "batch/v1", "kind": "Job", "metadata": meta,
                "spec": {"backoffLimit": 20, "template": {"metadata": {"labels": _labels(name)}, "spec": pod}},
            }]  # fmt: skip
        else:
            docs[name] = [{
                "apiVersion": "apps/v1", "kind": "Deployment", "metadata": meta,
                "spec": {
                    "replicas": 1, "strategy": {"type": "Recreate"},
                    "selector": {"matchLabels": {"app.kubernetes.io/name": name}},
                    "template": {"metadata": {"labels": _labels(name)}, "spec": pod},
                },
            }]  # fmt: skip
            if PORTS.get(name):
                docs[name].append(_service(name, name, PORTS[name]))
    for name in list(docs):
        if name in groups and groups[name]:
            docs[_group_file(groups[name], name)] = docs.pop(name)
    for alias, target in ALIASES.items():
        if target in services:
            docs.setdefault("aliases", []).append(_service(alias, target, PORTS[target]))
    docs["volumes"] = [
        {
            "apiVersion": "v1", "kind": "PersistentVolumeClaim", "metadata": {"name": v, "labels": {"app.kubernetes.io/part-of": "bamboo"}},
            "spec": {"accessModes": ["ReadWriteOnce"], "resources": {"requests": {"storage": VOLUME_SIZES.get(v, "1Gi")}}},
        }
        for v in sorted(volumes)
    ]  # fmt: skip
    docs["rbac"] = _rbac()
    return docs, settings


def _group_file(group: str, name: str) -> str:
    return f"{group}/{name}" if group else name


def k8s_image(image: str) -> str:
    """`${BAMBOO_IMAGE_PREFIX:-ghcr.io/thanhnlt/bamboo}-x:tag` thành tên cụ thể; overlay đổi thẻ bằng `images:`."""
    return resolve_default(image)


def _memory(value) -> str:
    text = str(value).lower()
    for suffix, unit in (("g", "Gi"), ("m", "Mi"), ("k", "Ki")):
        if text.endswith(suffix):
            return text[:-1] + unit
    return text


def _service(name: str, target: str, ports: list[int]) -> dict:
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": name, "labels": {"app.kubernetes.io/part-of": "bamboo"}},
        "spec": {
            "selector": {"app.kubernetes.io/name": target},
            "ports": [{"name": f"p{p}", "port": p, "targetPort": p} for p in ports],
        },
    }


def _rbac() -> list[dict]:
    """init container chờ Job xong bằng kubectl: quyền đọc Job, Pod trong namespace."""
    return [
        {"apiVersion": "v1", "kind": "ServiceAccount", "metadata": {"name": "bamboo"}},
        {
            "apiVersion": "rbac.authorization.k8s.io/v1", "kind": "Role", "metadata": {"name": "bamboo-wait"},
            "rules": [{"apiGroups": ["batch"], "resources": ["jobs"], "verbs": ["get", "list", "watch"]},
                      {"apiGroups": [""], "resources": ["pods"], "verbs": ["get", "list", "watch"]}],
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1", "kind": "RoleBinding", "metadata": {"name": "bamboo-wait"},
            "roleRef": {"apiGroup": "rbac.authorization.k8s.io", "kind": "Role", "name": "bamboo-wait"},
            "subjects": [{"kind": "ServiceAccount", "name": "bamboo"}],
        },
    ]  # fmt: skip


def render(version: str = VERSION) -> dict[pathlib.Path, str]:
    docs, settings = build(version)
    header = "".join(
        f"# {x}".rstrip() + "\n"
        for x in (ROOT / "docs/Header.txt").read_text(encoding="utf-8").strip("\n").splitlines()
    )
    note = "# Sinh bằng tools/k8s/generate.py từ cấu hình Docker Compose; đừng sửa tay.\n"
    files: dict[pathlib.Path, str] = {}
    groups: dict[str, list[str]] = {}
    for key, items in sorted(docs.items()):
        group, _, name = key.rpartition("/")
        directory = COMPONENTS / group if group else BASE
        body = "---\n".join(yaml.safe_dump(d, allow_unicode=True, sort_keys=False, width=120) for d in items)
        files[directory / f"{name}.yaml"] = header + "\n" + note + body
        groups.setdefault(group, []).append(f"{name}.yaml")
    for group, names in groups.items():
        kind = (
            ("kustomize.config.k8s.io/v1alpha1", "Component")
            if group
            else ("kustomize.config.k8s.io/v1beta1", "Kustomization")
        )
        kustomization = {"apiVersion": kind[0], "kind": kind[1]}
        if not group:
            kustomization["namespace"] = NAMESPACE
        kustomization["resources"] = sorted(names)
        path = (COMPONENTS / group if group else BASE) / "kustomization.yaml"
        files[path] = header + "\n" + note + yaml.safe_dump(kustomization, sort_keys=False)
    files[CI_SETTINGS] = (
        header
        + "\n# Giá trị mặc định của môi trường dev cho Secret bamboo-settings (overlay ci). Sinh bằng tools/k8s/generate.py.\n"
        + "".join(f"{k}={v}\n" for k, v in sorted(settings.items()))
    )
    return files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--version", default=VERSION)
    args = parser.parse_args()
    files = render(args.version)
    stale = sorted(p for p in [*BASE.glob("*.yaml"), *COMPONENTS.glob("*/*.yaml")] if p not in files)
    if args.check:
        bad = [p for p, text in files.items() if not p.exists() or p.read_text(encoding="utf-8") != text] + stale
        for p in bad:
            old = p.read_text(encoding="utf-8").splitlines() if p.exists() else []
            new = files.get(p, "").splitlines()
            sys.stdout.writelines(f"{line}\n" for line in difflib.unified_diff(old, new, str(p), str(p), lineterm=""))
        if bad:
            print("Manifest Kubernetes lệch với compose: chạy python tools/k8s/generate.py", file=sys.stderr)
            return 1
        return 0
    for p in stale:
        p.unlink()
    for p, text in files.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    print(f"đã ghi {len(files)} tệp vào infra/k8s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
