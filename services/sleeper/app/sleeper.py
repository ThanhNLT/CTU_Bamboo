"""Dịch vụ ngủ (ADR #53): `python -m app.sleeper`.

Đứng trước các dịch vụ dùng thưa (Trino, Tika, Gotenberg; Ollama và OCR của AI) dưới đúng tên mạng cũ. Có yêu cầu đến thì dựng
container thật dậy (docker start) rồi chuyển tiếp nguyên byte TCP, nên TLS của Trino vẫn đầu-cuối. Không có byte nào
qua proxy quá SLEEPER_IDLE_SECONDS thì docker stop để trả RAM. Chỉ chạm vào container có nhãn compose
`com.docker.compose.service` nằm trong SLEEPER_TARGETS.

SLEEPER_TARGETS: danh sách `cổng_nghe=dịch_vụ:cổng[@giây_nhàn_rỗi]` ngăn cách bằng dấu phẩy.

Mô-đun chức năng (ADR #56): định kỳ hỏi `SLEEPER_MODULES_URL` (actions `/modules/services`) container nào phải chạy, phải
dừng theo các mô-đun đã cài, rồi start/stop cho khớp. Chỉ chạm dịch vụ có tên trong SLEEPER_MANAGED. Dịch vụ ngủ (có trong
SLEEPER_TARGETS) của mô-đun chưa cài thì bị khóa: có yêu cầu đến cũng không đánh thức. SLEEPER_HOLD_UNTIL (bootstrap): chưa
dừng container compose vừa chạy cho tới khi dịch vụ này chạy xong sau lần khởi động đó.
"""

import asyncio
import json
import logging
import os
import shlex
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import quote, urlparse

log = logging.getLogger("sleeper")

CHUNK = 64 * 1024


class DockerError(Exception):
    pass


class Docker:
    """Gọi Docker Engine API qua unix socket; chỉ những thao tác sleeper cần."""

    def __init__(self, socket_path: str, project: str):
        self.socket_path = socket_path
        self.project = project

    async def _call(self, method: str, path: str, ok: tuple[int, ...], body: dict | None = None) -> bytes:
        payload = json.dumps(body).encode() if body is not None else b""
        head = f"{method} {path} HTTP/1.0\r\nHost: docker\r\nContent-Length: {len(payload)}\r\n"
        if body is not None:
            head += "Content-Type: application/json\r\n"
        reader, writer = await asyncio.open_unix_connection(self.socket_path)
        try:
            writer.write(head.encode() + b"\r\n" + payload)
            await writer.drain()
            raw = await reader.read()
        finally:
            writer.close()
        head, _, body = raw.partition(b"\r\n\r\n")
        status = int(head.split(b" ", 2)[1])
        if status not in ok:
            raise DockerError(f"{method} {path} -> {status}: {body.decode(errors='replace')[:200]}")
        return body

    async def find(self, service: str) -> str:
        labels = [
            f"com.docker.compose.project={self.project}",
            f"com.docker.compose.service={service}",
            "com.docker.compose.oneoff=False",
        ]
        query = quote(json.dumps({"label": labels}))
        found = json.loads(await self._call("GET", f"/containers/json?all=1&filters={query}", (200,)))
        found.sort(key=lambda c: any(n.endswith(SWAP_SUFFIXES) for n in c.get("Names") or []))
        if not found:
            raise DockerError(f"không thấy container của dịch vụ {service} (dự án {self.project})")
        return found[0]["Id"]

    async def inspect(self, container: str) -> dict:
        return json.loads(await self._call("GET", f"/containers/{container}/json", (200,)))

    async def state(self, container: str) -> dict:
        return (await self.inspect(container))["State"]

    async def start(self, container: str) -> None:
        await self._call("POST", f"/containers/{container}/start", (204, 304))

    async def stop(self, container: str, grace: int = 30) -> None:
        await self._call("POST", f"/containers/{container}/stop?t={grace}", (204, 304))

    async def create(self, name: str, body: dict) -> str:
        return json.loads(await self._call("POST", f"/containers/create?name={quote(name)}", (201,), body))["Id"]

    async def rename(self, container: str, name: str) -> None:
        await self._call("POST", f"/containers/{container}/rename?name={quote(name)}", (204,))

    async def remove(self, container: str) -> None:
        await self._call("DELETE", f"/containers/{container}?force=1", (204, 404))

    async def wait(self, container: str) -> int:
        return json.loads(await self._call("POST", f"/containers/{container}/wait", (200,)))["StatusCode"]


SWAP_SUFFIXES = ("-sleeper-old", "-sleeper-new")
GPU_REQUEST = {"Driver": "nvidia", "Count": -1, "DeviceIDs": None, "Capabilities": [["gpu"]], "Options": {}}


def has_gpu(info: dict) -> bool:
    return any(
        r.get("Driver") == "nvidia" or ["gpu"] in (r.get("Capabilities") or [])
        for r in (info.get("HostConfig") or {}).get("DeviceRequests") or []
    )


def clone_body(info: dict, gpu: bool) -> dict:
    """Thân `POST /containers/create` tái tạo đúng container compose (cấu hình, nhãn, volume, mạng), chỉ đổi GPU.
    Nhãn com.docker.compose.* giữ nguyên (cả config-hash) nên `docker compose up` sau đó coi container là của nó và
    không tạo lại."""
    config = dict(info["Config"])
    if config.get("Hostname") == info["Id"][:12]:
        config.pop("Hostname")
    config.pop("MacAddress", None)
    host = dict(info["HostConfig"])
    others = [r for r in host.get("DeviceRequests") or [] if not has_gpu({"HostConfig": {"DeviceRequests": [r]}})]
    host["DeviceRequests"] = others + [GPU_REQUEST] if gpu else others
    networks = {
        name: {k: ep[k] for k in ("Aliases", "Links", "IPAMConfig", "DriverOpts") if ep.get(k)}
        for name, ep in ((info.get("NetworkSettings") or {}).get("Networks") or {}).items()
    }
    return {**config, "HostConfig": host, "NetworkingConfig": {"EndpointsConfig": networks}}


class Gpu:
    """Cho Ollama, OCR dùng card NVIDIA khi máy có, chỉ với `docker compose up` (ADR #79).

    Compose không xin GPU có điều kiện được (xin mà máy không có thì container không tạo được), nên compose luôn tạo bản
    CPU. Sau khi `gate` (ai-worker, chạy sau ollama-init và ocr-core) đã chạy, sleeper thử một container nhỏ xin GPU từ
    chính image đó; được thì tạo lại từng dịch vụ với cùng cấu hình cộng GPU, kiểm container mới khởi động được rồi mới
    xóa bản CPU. Tạo, khởi động lỗi thì trả lại bản CPU và không thử nữa cho tới lần sleeper khởi động sau. Container
    GPU về sau không start được (đổi driver, tháo card) thì tự đổi về CPU. Image có nhãn `bamboo.gpu.prepare` (OCR,
    ADR #80) cần chuẩn bị trước: chạy lệnh đó một lần trong container phụ từ chính image (cùng volume, mạng, không alias)
    rồi mới chuyển; lỗi thì giữ CPU. mode: auto | true | false (BAMBOO_GPU)."""

    def __init__(
        self,
        docker: Docker,
        services: list[str],
        targets: list["Target"],
        mode: str = "auto",
        gate: str = "ai-worker",
        verify_timeout: float = 240,
    ):
        self.docker = docker
        self.services = services
        self.targets = {t.service: t for t in targets}
        self.mode = mode
        self.gate = gate
        self.verify_timeout = verify_timeout
        self.usable: bool | None = None
        self.failed: set[str] = set()
        self.preparing: dict[str, str] = {}
        self.prepared: dict[str, str] = {}

    async def probe(self, image: str) -> bool:
        name = f"{self.docker.project}-gpu-probe"
        await self.docker.remove(name)
        body = {
            "Image": image,
            "Entrypoint": ["true"],
            "Cmd": [],
            "Labels": {"bamboo.sleeper": "gpu-probe"},
            "HostConfig": {"NetworkMode": "none", "DeviceRequests": [GPU_REQUEST]},
        }
        try:
            probe = await self.docker.create(name, body)
            try:
                await self.docker.start(probe)
                return await asyncio.wait_for(self.docker.wait(probe), 60) == 0
            finally:
                await self.docker.remove(probe)
        except (DockerError, OSError, asyncio.TimeoutError) as exc:
            log.info("không dùng được GPU NVIDIA (%s): Ollama, OCR chạy trên CPU", exc)
            return False

    async def _gate_open(self) -> bool:
        try:
            return bool((await self.docker.state(await self.docker.find(self.gate))).get("Running"))
        except DockerError:
            return False

    async def reconcile(self) -> list[str]:
        """Một lượt; trả các dịch vụ vừa đổi."""
        done = []
        for service in self.services:
            try:
                info = await self.docker.inspect(await self.docker.find(service))
            except DockerError:
                continue
            state = info["State"]
            if has_gpu(info):
                if not state.get("Running") and state.get("Error"):
                    log.warning("%s không khởi động được với GPU (%s): đổi về CPU", service, state["Error"])
                    self.failed.add(service)
                    if await self._swap(service, info, gpu=False):
                        done.append(service)
                continue
            if self.mode == "false" or service in self.failed or self.usable is False:
                continue
            target = self.targets.get(service)
            if state.get("Running") and (not await self._gate_open() or (target and target.writers)):
                continue
            if self.usable is None:
                self.usable = await self.probe(info["Config"]["Image"])
                if not self.usable:
                    continue
                log.info("thấy GPU NVIDIA: chuyển %s sang GPU", ", ".join(self.services))
            prepare = (info["Config"].get("Labels") or {}).get("bamboo.gpu.prepare")
            image = info.get("Image") or info["Config"]["Image"]
            if prepare and self.prepared.get(service) != image:  # image mới (dựng lại) thì chuẩn bị lại
                ready = await self._prepare(service, info, prepare)
                if ready is None:
                    continue
                if not ready:
                    self.failed.add(service)
                    continue
                self.prepared[service] = image
            if await self._swap(service, info, gpu=True):
                done.append(service)
            else:
                self.failed.add(service)
        return done

    async def _prepare(self, service: str, info: dict, command: str) -> bool | None:
        """Chạy lệnh chuẩn bị GPU của image trong container phụ; None khi còn đang chạy (xem lại ở lượt sau)."""
        cid = self.preparing.get(service)
        if cid is None:
            name = f"{self.docker.project}-{service}-gpu-prepare"
            await self.docker.remove(name)
            body = clone_body(info, gpu=False)
            body["Labels"] = {"bamboo.sleeper": "gpu-prepare"}
            body["Cmd"] = shlex.split(command)
            body["Healthcheck"] = {"Test": ["NONE"]}
            body["HostConfig"] = {**body["HostConfig"], "RestartPolicy": {"Name": "no"}}
            # không mang alias của dịch vụ để không nhận nhầm yêu cầu gửi tới nó
            body["NetworkingConfig"] = {"EndpointsConfig": {n: {} for n in body["NetworkingConfig"]["EndpointsConfig"]}}
            try:
                cid = await self.docker.create(name, body)
                await self.docker.start(cid)
            except DockerError as exc:
                log.warning("không chuẩn bị được GPU cho %s: %s", service, exc)
                if cid:
                    await self.docker.remove(cid)
                return False
            self.preparing[service] = cid
            log.info("chuẩn bị GPU cho %s (%s), chỉ một lần", service, command)
            return None
        try:
            state = await self.docker.state(cid)
        except DockerError as exc:
            log.warning("mất container chuẩn bị GPU của %s: %s", service, exc)
            del self.preparing[service]
            return False
        if state.get("Running"):
            return None
        del self.preparing[service]
        await self.docker.remove(cid)
        if state.get("ExitCode") == 0:
            return True
        log.warning("chuẩn bị GPU cho %s lỗi (mã %s): giữ CPU", service, state.get("ExitCode"))
        return False

    async def _swap(self, service: str, info: dict, gpu: bool) -> bool:
        target = self.targets.get(service)
        lock = target.awake_lock if target else asyncio.Lock()
        async with lock:
            ok = await self._replace(service, info, gpu)
            if target:
                target.container = ""
        return ok

    async def _replace(self, service: str, info: dict, gpu: bool) -> bool:
        name = info["Name"].lstrip("/")
        old = info["Id"]
        running = bool(info["State"].get("Running"))
        kind = "GPU" if gpu else "CPU"
        await self.docker.remove(name + "-sleeper-new")
        try:
            new = await self.docker.create(name + "-sleeper-new", clone_body(info, gpu))
        except DockerError as exc:
            log.warning("không tạo được %s bản %s: %s", service, kind, exc)
            return False
        try:
            if running:
                await self.docker.stop(old)
            await self.docker.rename(old, name + "-sleeper-old")
            await self.docker.rename(new, name)
        except DockerError as exc:
            log.warning("không đổi được %s sang %s: %s", service, kind, exc)
            await self.docker.remove(new)
            await self._restore(old, name, running)
            return False
        if await self._verify(new):
            if not running:
                await self.docker.stop(new)
            await self.docker.remove(old)
            log.info("%s chạy bản %s", service, kind)
            return True
        log.warning("%s bản %s không khởi động được: giữ bản cũ", service, kind)
        await self.docker.remove(new)
        await self._restore(old, name, running)
        return False

    async def _restore(self, old: str, name: str, running: bool) -> None:
        try:
            await self.docker.rename(old, name)
            if running:
                await self.docker.start(old)
        except DockerError as exc:
            log.error("không trả lại được container %s: %s", name, exc)

    async def _verify(self, container: str) -> bool:
        """Container mới start được và (nếu có healthcheck) healthy trong verify_timeout."""
        try:
            await self.docker.start(container)
        except DockerError as exc:
            log.warning("start lỗi: %s", exc)
            return False
        deadline = time.monotonic() + self.verify_timeout
        while time.monotonic() < deadline:
            state = await self.docker.state(container)
            if not state.get("Running"):
                return False
            if state.get("Health", {}).get("Status", "healthy") == "healthy":
                return True
            await asyncio.sleep(1)
        return False


def parse_targets(spec: str, default_idle: float) -> list["Target"]:
    targets = []
    for item in filter(None, (part.strip() for part in spec.split(","))):
        listen, _, rest = item.partition("=")
        rest, _, idle = rest.partition("@")
        service, _, port = rest.partition(":")
        if not (listen.isdigit() and service and port.isdigit()):
            raise ValueError(f"SLEEPER_TARGETS sai ở {item!r}, mẫu: 8443=trino-core:8443[@300]")
        targets.append(Target(int(listen), service, int(port), float(idle) if idle else default_idle))
    return targets


def started_at(state: dict, key: str = "StartedAt") -> float:
    """Epoch giây của lần khởi động gần nhất (hoặc `FinishedAt`); Docker trả RFC 3339 nano giây."""
    text = state.get(key, "")
    if not text or text.startswith("0001"):
        return 0.0
    head, _, frac = text.rstrip("Z").partition(".")
    return datetime.fromisoformat(f"{head}.{frac[:6] or '0'}").replace(tzinfo=UTC).timestamp()


@dataclass
class Target:
    listen_port: int
    service: str
    port: int
    idle_seconds: float
    last_activity: float = field(default_factory=time.monotonic)
    awake_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    writers: set = field(default_factory=set)
    container: str = ""
    blocked: bool = False

    def touch(self) -> None:
        self.last_activity = time.monotonic()

    async def inspect(self, docker: Docker) -> dict:
        """Trạng thái container; compose tạo lại container (id mới) thì tìm lại theo nhãn."""
        if self.container:
            try:
                return await docker.state(self.container)
            except DockerError:
                self.container = ""
        self.container = await docker.find(self.service)
        return await docker.state(self.container)

    async def ensure_awake(self, docker: Docker, timeout: float) -> None:
        """Dựng container dậy nếu đang ngủ và chờ tới khi sẵn sàng; nhiều yêu cầu cùng đến thì chỉ một lần start."""
        async with self.awake_lock:
            state = await self.inspect(docker)
            if state.get("Running") and state.get("Health", {}).get("Status", "healthy") == "healthy":
                return
            if not state.get("Running"):
                log.info("đánh thức %s", self.service)
                await docker.start(self.container)
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                state = await docker.state(self.container)
                if state.get("Running") and state.get("Health", {}).get("Status", "healthy") == "healthy":
                    self.touch()
                    return
                if not state.get("Running"):
                    raise DockerError(f"{self.service} thoát ngay sau khi start (mã {state.get('ExitCode')})")
                await asyncio.sleep(0.5)
            raise DockerError(f"{self.service} chưa sẵn sàng sau {timeout:.0f} giây")

    async def sleep_if_idle(self, docker: Docker) -> bool:
        """Dừng container nếu không có byte nào qua proxy quá idle_seconds; trả True nếu vừa dừng."""
        if self.awake_lock.locked():
            return False
        async with self.awake_lock:
            try:
                state = await self.inspect(docker)
            except DockerError:
                return False
            if not state.get("Running"):
                return False
            quiet = min(time.monotonic() - self.last_activity, time.time() - started_at(state))
            if quiet < self.idle_seconds:
                return False
            log.info("cho %s ngủ sau %.0f giây nhàn rỗi", self.service, quiet)
            await docker.stop(self.container)
        for writer in list(self.writers):
            writer.close()
        return True

    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, docker: Docker, timeout: float):
        self.writers.add(writer)
        upstream = None
        try:
            first = await reader.read(CHUNK)
            if not first:
                return
            if self.blocked:
                log.info("%s thuộc mô-đun chưa cài: không đánh thức", self.service)
                return
            self.touch()
            await self.ensure_awake(docker, timeout)
            up_reader, upstream = await asyncio.open_connection(self.service, self.port)
            self.writers.add(upstream)
            upstream.write(first)
            await upstream.drain()
            await asyncio.gather(self._pipe(reader, upstream), self._pipe(up_reader, writer))
        except (DockerError, OSError) as exc:
            log.warning("%s: %s", self.service, exc)
        finally:
            for w in (writer, upstream):
                if w is not None:
                    self.writers.discard(w)
                    w.close()

    async def _pipe(self, src: asyncio.StreamReader, dst: asyncio.StreamWriter) -> None:
        try:
            while chunk := await src.read(CHUNK):
                self.touch()
                dst.write(chunk)
                await dst.drain()
        except OSError:
            pass
        finally:
            dst.close()


async def http_get_json(url: str, timeout: float = 5.0) -> dict:
    """GET một URL http:// trong mạng nội bộ, trả JSON (thư viện chuẩn, không thêm gói)."""
    parts = urlparse(url)
    if parts.scheme != "http" or not parts.hostname:
        raise ValueError(f"chỉ hỗ trợ http://: {url}")
    path = parts.path or "/"
    if parts.query:
        path += f"?{parts.query}"

    async def call() -> bytes:
        reader, writer = await asyncio.open_connection(parts.hostname, parts.port or 80)
        try:
            writer.write(f"GET {path} HTTP/1.0\r\nHost: {parts.hostname}\r\nAccept: application/json\r\n\r\n".encode())
            await writer.drain()
            return await reader.read()
        finally:
            writer.close()

    raw = await asyncio.wait_for(call(), timeout)
    head, _, body = raw.partition(b"\r\n\r\n")
    status = int(head.split(b" ", 2)[1])
    if status != 200:
        raise OSError(f"GET {url} -> {status}")
    return json.loads(body)


class Modules:
    """Đưa container của mô-đun về đúng trạng thái actions yêu cầu (ADR #56)."""

    def __init__(
        self,
        docker: Docker,
        url: str,
        managed: set[str],
        targets: list[Target],
        fetch=http_get_json,
        hold_until: str = "",
    ):
        self.docker = docker
        self.url = url
        self.managed = managed
        self.targets = {t.service: t for t in targets}
        self.fetch = fetch
        self.hold_until = hold_until
        self.containers: dict[str, str] = {}
        self.started_by_us: set[str] = set()

    async def _held(self, service: str, state: dict) -> bool:
        """Chưa dừng dịch vụ compose vừa chạy khi `hold_until` (bootstrap) chưa chạy xong sau lần khởi động đó:
        bootstrap chờ Flowable, Meilisearch healthy để dựng BPMN, chỉ mục, nên dừng sớm làm `docker compose up` hỏng."""
        if not self.hold_until or service in self.started_by_us:
            return False
        try:
            done = await self.docker.state(await self.docker.find(self.hold_until))
        except DockerError:
            return True
        if done.get("Running") or done.get("Status") in ("created", "restarting") or done.get("ExitCode"):
            return True
        return started_at(done, "FinishedAt") < started_at(state)

    async def _state(self, service: str) -> dict:
        container = self.containers.get(service) or await self.docker.find(service)
        try:
            state = await self.docker.state(container)
        except DockerError:
            container = await self.docker.find(service)
            state = await self.docker.state(container)
        self.containers[service] = container
        return state

    async def reconcile(self) -> dict:
        """Một lượt đối chiếu; trả các dịch vụ vừa start/stop. actions chưa trả lời thì giữ nguyên hiện trạng."""
        try:
            desired = await self.fetch(self.url)
        except (OSError, ValueError, asyncio.TimeoutError) as exc:
            log.debug("chưa hỏi được mô-đun từ %s: %s", self.url, exc)
            return {"started": [], "stopped": []}
        order = [s for s in desired.get("run", []) if s in self.managed]
        run = set(order)
        stop = (set(desired.get("stop", [])) & self.managed) - run
        done = {"started": [], "stopped": []}
        for service in sorted(stop) + order:
            target = self.targets.get(service)
            if target is not None:
                target.blocked = service in stop
            try:
                state = await self._state(service)
                if service in stop and state.get("Running"):
                    if await self._held(service, state):
                        log.info("chưa dừng %s: chờ %s chạy xong", service, self.hold_until)
                        continue
                    log.info("dừng %s: mô-đun chưa cài", service)
                    await self.docker.stop(self.containers[service])
                    self.started_by_us.discard(service)
                    done["stopped"].append(service)
                    if target is not None:
                        for writer in list(target.writers):
                            writer.close()
                elif service in run and target is None and not state.get("Running"):
                    log.info("chạy %s: mô-đun đã cài", service)
                    await self.docker.start(self.containers[service])
                    self.started_by_us.add(service)
                    done["started"].append(service)
            except (DockerError, OSError) as exc:
                log.warning("không đưa được %s về trạng thái mô-đun: %s", service, exc)
        return done

    async def status(self) -> dict:
        out = {}
        for service in sorted(self.managed - set(self.targets)):
            try:
                running = bool((await self._state(service)).get("Running"))
            except (DockerError, OSError):
                running = None
            out[service] = {"running": running}
        return out

    async def watch(self, every: float) -> None:
        while True:
            await self.reconcile()
            await asyncio.sleep(every)


class Sleeper:
    def __init__(
        self,
        docker: Docker,
        targets: list[Target],
        wake_timeout: float = 180,
        check_every: float = 30,
        modules: Modules | None = None,
        gpu: Gpu | None = None,
    ):
        self.gpu = gpu
        self.docker = docker
        self.targets = targets
        self.wake_timeout = wake_timeout
        self.check_every = check_every
        self.modules = modules

    async def watch(self) -> None:
        while True:
            await asyncio.sleep(self.check_every)
            for target in self.targets:
                try:
                    await target.sleep_if_idle(self.docker)
                except (DockerError, OSError) as exc:
                    log.warning("không kiểm tra được %s: %s", target.service, exc)

    async def status(self) -> dict:
        out = {}
        for target in self.targets:
            try:
                running = bool((await target.inspect(self.docker))["Running"])
            except (DockerError, OSError):
                running = None
            out[target.service] = {
                "running": running,
                "idle_for": round(time.monotonic() - target.last_activity),
                "blocked": target.blocked,
            }
        if self.modules is not None:
            out.update(await self.modules.status())
        return out

    async def _admin(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        """/healthz cho healthcheck (không đánh thức ai) và /status."""
        try:
            line = (await reader.readline()).decode(errors="replace")
            body = json.dumps(await self.status()) if " /status" in line else "ok"
            writer.write(f"HTTP/1.0 200 OK\r\nContent-Length: {len(body)}\r\n\r\n{body}".encode())
            await writer.drain()
        except OSError:
            pass
        finally:
            writer.close()

    async def run(self, admin_port: int) -> None:
        servers = [
            await asyncio.start_server(
                lambda r, w, t=t: t.handle(r, w, self.docker, self.wake_timeout), "0.0.0.0", t.listen_port
            )
            for t in self.targets
        ]
        servers.append(await asyncio.start_server(self._admin, "0.0.0.0", admin_port))
        for t in self.targets:
            log.info("cổng %d -> %s:%d, ngủ sau %.0f giây", t.listen_port, t.service, t.port, t.idle_seconds)
        if self.modules is not None:
            log.info("theo mô-đun từ %s, quản lý %s", self.modules.url, ", ".join(sorted(self.modules.managed)))
        if self.modules is None and self.gpu is None:
            await self.watch()
        else:
            await asyncio.gather(self.watch(), self.background(float(os.environ.get("SLEEPER_MODULES_EVERY", "15"))))

    async def background(self, every: float) -> None:
        """Đối chiếu mô-đun rồi GPU, tuần tự để hai việc không cùng start/stop một container."""
        while True:
            if self.modules is not None:
                await self.modules.reconcile()
            if self.gpu is not None:
                try:
                    await self.gpu.reconcile()
                except (DockerError, OSError) as exc:
                    log.warning("không đối chiếu được GPU: %s", exc)
            await asyncio.sleep(every)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    idle = float(os.environ.get("SLEEPER_IDLE_SECONDS", "300"))
    targets = parse_targets(os.environ["SLEEPER_TARGETS"], idle)
    docker = Docker(
        os.environ.get("DOCKER_SOCKET", "/var/run/docker.sock"), os.environ.get("SLEEPER_PROJECT", "bamboo")
    )
    modules_url = os.environ.get("SLEEPER_MODULES_URL", "")
    managed = {s.strip() for s in os.environ.get("SLEEPER_MANAGED", "").split(",") if s.strip()}
    hold_until = os.environ.get("SLEEPER_HOLD_UNTIL", "")
    modules = Modules(docker, modules_url, managed, targets, hold_until=hold_until) if modules_url and managed else None
    gpu_mode = os.environ.get("SLEEPER_GPU", "auto").strip().lower() or "auto"
    gpu_services = [s.strip() for s in os.environ.get("SLEEPER_GPU_SERVICES", "").split(",") if s.strip()]
    gpu = Gpu(docker, gpu_services, targets, gpu_mode) if gpu_services and gpu_mode != "false" else None
    sleeper = Sleeper(docker, targets, float(os.environ.get("SLEEPER_WAKE_TIMEOUT", "180")), modules=modules, gpu=gpu)
    asyncio.run(sleeper.run(int(os.environ.get("SLEEPER_ADMIN_PORT", "9000"))))


if __name__ == "__main__":
    main()
