# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Dịch vụ ngủ (ADR #53): `python -m app.sleeper`.

Đứng trước các dịch vụ Tầng 1 dùng thưa (Trino, Tika, Gotenberg) dưới đúng tên mạng cũ. Có yêu cầu đến thì dựng
container thật dậy (docker start) rồi chuyển tiếp nguyên byte TCP, nên TLS của Trino vẫn đầu-cuối. Không có byte nào
qua proxy quá SLEEPER_IDLE_SECONDS thì docker stop để trả RAM. Chỉ chạm vào container có nhãn compose
`com.docker.compose.service` nằm trong SLEEPER_TARGETS.

SLEEPER_TARGETS: danh sách `cổng_nghe=dịch_vụ:cổng[@giây_nhàn_rỗi]` ngăn cách bằng dấu phẩy.
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import quote

log = logging.getLogger("sleeper")

CHUNK = 64 * 1024


class DockerError(Exception):
    pass


class Docker:
    """Gọi Docker Engine API qua unix socket; chỉ những thao tác sleeper cần."""

    def __init__(self, socket_path: str, project: str):
        self.socket_path = socket_path
        self.project = project

    async def _call(self, method: str, path: str, ok: tuple[int, ...]) -> bytes:
        reader, writer = await asyncio.open_unix_connection(self.socket_path)
        try:
            writer.write(f"{method} {path} HTTP/1.0\r\nHost: docker\r\nContent-Length: 0\r\n\r\n".encode())
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
        labels = [f"com.docker.compose.project={self.project}", f"com.docker.compose.service={service}"]
        query = quote(json.dumps({"label": labels}))
        found = json.loads(await self._call("GET", f"/containers/json?all=1&filters={query}", (200,)))
        if not found:
            raise DockerError(f"không thấy container của dịch vụ {service} (dự án {self.project})")
        return found[0]["Id"]

    async def state(self, container: str) -> dict:
        return json.loads(await self._call("GET", f"/containers/{container}/json", (200,)))["State"]

    async def start(self, container: str) -> None:
        await self._call("POST", f"/containers/{container}/start", (204, 304))

    async def stop(self, container: str, grace: int = 30) -> None:
        await self._call("POST", f"/containers/{container}/stop?t={grace}", (204, 304))


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


def started_at(state: dict) -> float:
    """Epoch giây của lần khởi động gần nhất (Docker trả RFC 3339 nano giây)."""
    text = state.get("StartedAt", "")
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

    def touch(self) -> None:
        self.last_activity = time.monotonic()

    async def ensure_awake(self, docker: Docker, timeout: float) -> None:
        """Dựng container dậy nếu đang ngủ và chờ tới khi sẵn sàng; nhiều yêu cầu cùng đến thì chỉ một lần start."""
        async with self.awake_lock:
            if not self.container:
                self.container = await docker.find(self.service)
            state = await docker.state(self.container)
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
            return False  # đang đánh thức hoặc đang dừng
        async with self.awake_lock:
            if not self.container:
                try:
                    self.container = await docker.find(self.service)
                except DockerError:
                    return False
            state = await docker.state(self.container)
            if not state.get("Running"):
                return False
            quiet = min(time.monotonic() - self.last_activity, time.time() - started_at(state))
            if quiet < self.idle_seconds:
                return False
            log.info("cho %s ngủ sau %.0f giây nhàn rỗi", self.service, quiet)
            await docker.stop(self.container)
        for writer in list(self.writers):  # kết nối giữ sống (keep-alive) của máy khách trỏ vào container đã dừng
            writer.close()
        return True

    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, docker: Docker, timeout: float):
        self.writers.add(writer)
        upstream = None
        try:
            first = await reader.read(CHUNK)  # thăm dò TCP không gửi byte nào thì không đánh thức
            if not first:
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


class Sleeper:
    def __init__(self, docker: Docker, targets: list[Target], wake_timeout: float = 180, check_every: float = 30):
        self.docker = docker
        self.targets = targets
        self.wake_timeout = wake_timeout
        self.check_every = check_every

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
                running = bool(
                    (await self.docker.state(target.container or await self.docker.find(target.service)))["Running"]
                )
            except (DockerError, OSError):
                running = None
            out[target.service] = {"running": running, "idle_for": round(time.monotonic() - target.last_activity)}
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
        await self.watch()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    idle = float(os.environ.get("SLEEPER_IDLE_SECONDS", "300"))
    targets = parse_targets(os.environ["SLEEPER_TARGETS"], idle)
    docker = Docker(
        os.environ.get("DOCKER_SOCKET", "/var/run/docker.sock"), os.environ.get("SLEEPER_PROJECT", "bamboo")
    )
    sleeper = Sleeper(docker, targets, float(os.environ.get("SLEEPER_WAKE_TIMEOUT", "180")))
    asyncio.run(sleeper.run(int(os.environ.get("SLEEPER_ADMIN_PORT", "9000"))))


if __name__ == "__main__":
    main()
