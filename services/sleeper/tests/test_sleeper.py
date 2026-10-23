# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
import asyncio
import time
import unittest

from app.sleeper import DockerError, Sleeper, Target, parse_targets, started_at


class FakeDocker:
    """Thay Docker Engine: container 'ngủ' là upstream chưa nghe cổng; start thì mở cổng echo."""

    def __init__(self, upstream_port: int):
        self.upstream_port = upstream_port
        self.running = False
        self.started = 0
        self.stopped = 0
        self.health = None  # None = không có healthcheck
        self.started_at = "2020-01-01T00:00:00.5Z"
        self.server = None

    async def find(self, service):
        return "cid"

    async def state(self, container):
        state = {"Running": self.running, "StartedAt": self.started_at}
        if self.health and self.running:
            state["Health"] = {"Status": self.health}
        return state

    async def start(self, container):
        self.started += 1
        await asyncio.sleep(0.05)
        self.running = True
        self.server = await asyncio.start_server(self._echo, "127.0.0.1", self.upstream_port)

    async def stop(self, container, grace=30):
        self.stopped += 1
        self.running = False
        self.server.close()

    async def _echo(self, reader, writer):
        while data := await reader.read(1024):
            writer.write(data.upper())
            await writer.drain()
        writer.close()


def free_port() -> int:
    import socket

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class SleeperTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.up_port = free_port()
        self.docker = FakeDocker(self.up_port)
        # Target nối tới `service` bằng open_connection; 127.0.0.1 đóng vai tên mạng compose
        self.target = Target(free_port(), "127.0.0.1", self.up_port, idle_seconds=0.2)
        self.sleeper = Sleeper(self.docker, [self.target], wake_timeout=5, check_every=0.05)
        self.server = await asyncio.start_server(
            lambda r, w: self.target.handle(r, w, self.docker, 5), "127.0.0.1", self.target.listen_port
        )

    async def asyncTearDown(self):
        self.server.close()
        if self.docker.server:
            self.docker.server.close()

    async def ask(self, payload: bytes) -> bytes:
        reader, writer = await asyncio.open_connection("127.0.0.1", self.target.listen_port)
        writer.write(payload)
        await writer.drain()
        data = await asyncio.wait_for(reader.read(1024), 5)
        writer.close()
        return data

    async def test_wakes_on_first_request_and_proxies(self):
        self.assertFalse(self.docker.running)
        self.assertEqual(await self.ask(b"xin chao"), b"XIN CHAO")
        self.assertEqual(self.docker.started, 1)

    async def test_probe_without_bytes_does_not_wake(self):
        _, writer = await asyncio.open_connection("127.0.0.1", self.target.listen_port)
        writer.close()
        await asyncio.sleep(0.1)
        self.assertEqual(self.docker.started, 0)

    async def test_concurrent_requests_start_once(self):
        results = await asyncio.gather(*(self.ask(b"a") for _ in range(5)))
        self.assertEqual(results, [b"A"] * 5)
        self.assertEqual(self.docker.started, 1)

    async def test_sleeps_after_idle_and_wakes_again(self):
        await self.ask(b"x")
        self.assertFalse(await self.target.sleep_if_idle(self.docker))  # vừa dùng xong
        await asyncio.sleep(0.3)
        self.assertTrue(await self.target.sleep_if_idle(self.docker))
        self.assertEqual(self.docker.stopped, 1)
        self.assertEqual(await self.ask(b"y"), b"Y")
        self.assertEqual(self.docker.started, 2)

    async def test_recently_started_container_is_not_stopped(self):
        self.docker.running = True
        self.docker.started_at = time.strftime("%Y-%m-%dT%H:%M:%S.0Z", time.gmtime())
        self.target.last_activity = time.monotonic() - 10
        self.target.idle_seconds = 60
        self.assertFalse(await self.target.sleep_if_idle(self.docker))

    async def test_waits_for_healthy(self):
        self.docker.health = "starting"
        task = asyncio.create_task(self.ask(b"z"))
        await asyncio.sleep(0.3)
        self.assertFalse(task.done())
        self.docker.health = "healthy"
        self.assertEqual(await task, b"Z")

    async def test_watch_loop_stops_idle_container(self):
        await self.ask(b"x")
        watcher = asyncio.create_task(self.sleeper.watch())
        await asyncio.sleep(0.6)
        watcher.cancel()
        self.assertEqual(self.docker.stopped, 1)


class ParseTest(unittest.TestCase):
    def test_parse_targets(self):
        targets = parse_targets("8443=trino-core:8443@600, 9998=tika-core:9998", 300)
        self.assertEqual(
            [(t.listen_port, t.service, t.port, t.idle_seconds) for t in targets],
            [(8443, "trino-core", 8443, 600.0), (9998, "tika-core", 9998, 300.0)],
        )

    def test_parse_rejects_bad_spec(self):
        with self.assertRaises(ValueError):
            parse_targets("trino:8443", 300)

    def test_started_at(self):
        self.assertEqual(started_at({"StartedAt": "2020-01-01T00:00:00.123456789Z"}), 1577836800.123456)
        self.assertEqual(started_at({"StartedAt": "0001-01-01T00:00:00Z"}), 0.0)
        self.assertEqual(started_at({}), 0.0)

    def test_docker_error_is_exception(self):
        self.assertTrue(issubclass(DockerError, Exception))
