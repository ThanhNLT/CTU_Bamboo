# Bamboo - DX-OS Open-Core
# @version 0.5.2
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

import asyncio
import time
import unittest

from app.sleeper import DockerError, Modules, Sleeper, Target, http_get_json, parse_targets, started_at


class FakeDocker:
    """Thay Docker Engine: container 'ngủ' là upstream chưa nghe cổng; start thì mở cổng echo."""

    def __init__(self, upstream_port: int):
        self.upstream_port = upstream_port
        self.running = False
        self.started = 0
        self.stopped = 0
        self.health = None
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
        self.assertFalse(await self.target.sleep_if_idle(self.docker))
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

    async def test_finds_container_again_after_recreate(self):
        await self.ask(b"x")
        state = self.docker.state

        async def gone(container):
            if container == "cid":
                raise DockerError("404 không còn container")
            return await state(container)

        self.docker.state = gone
        self.docker.find = lambda service: asyncio.sleep(0, "cid-moi")
        self.assertEqual(await self.ask(b"y"), b"Y")
        self.assertEqual(self.target.container, "cid-moi")

    async def test_watch_loop_stops_idle_container(self):
        await self.ask(b"x")
        watcher = asyncio.create_task(self.sleeper.watch())
        await asyncio.sleep(0.6)
        watcher.cancel()
        self.assertEqual(self.docker.stopped, 1)


class ManyDocker:
    """Docker giả nhiều container theo tên dịch vụ; dịch vụ không có trong `running` là chưa tạo container."""

    def __init__(self, running: dict[str, bool]):
        self.running = running
        self.calls = []

    async def find(self, service):
        if service not in self.running:
            raise DockerError(f"không thấy container của dịch vụ {service}")
        return f"c-{service}"

    async def state(self, container):
        state = self.running[container[2:]]
        return state if isinstance(state, dict) else {"Running": state}

    async def start(self, container):
        self.calls.append(("start", container[2:]))
        self.running[container[2:]] = {"Running": True, "StartedAt": "2030-01-01T00:00:00Z"}

    async def stop(self, container, grace=30):
        self.calls.append(("stop", container[2:]))
        self.running[container[2:]] = False


class ModulesTest(unittest.IsolatedAsyncioTestCase):
    def make(self, desired, running, managed=("flowable", "kafka", "trino-core", "meilisearch"), hold_until=""):
        async def fetch(url):
            if isinstance(desired, Exception):
                raise desired
            return desired

        self.docker = ManyDocker(running)
        self.lazy = Target(0, "trino-core", 8443, 300)
        return Modules(
            self.docker, "http://actions:8000/modules/services", set(managed), [self.lazy], fetch, hold_until=hold_until
        )

    async def test_stops_uninstalled_and_starts_installed(self):
        modules = self.make(
            {"run": ["flowable", "meilisearch"], "stop": ["kafka", "trino-core"]},
            {"flowable": False, "kafka": True, "trino-core": True, "meilisearch": True},
        )
        done = await modules.reconcile()
        self.assertEqual(done, {"started": ["flowable"], "stopped": ["kafka", "trino-core"]})
        self.assertTrue(self.lazy.blocked)
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": []})

    async def test_lazy_service_is_unblocked_but_not_started(self):
        modules = self.make({"run": ["trino-core"], "stop": []}, {"trino-core": False})
        self.lazy.blocked = True
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": []})
        self.assertFalse(self.lazy.blocked)

    async def test_waits_for_bootstrap_before_stopping(self):
        """Hệ thống trống: chưa cài mô-đun nào nhưng bootstrap còn chờ Flowable healthy thì chưa dừng Flowable."""
        flowable = {"Running": True, "StartedAt": "2026-10-30T08:00:00Z"}
        bootstrap = {"Running": False, "Status": "exited", "ExitCode": 0, "FinishedAt": "2026-10-29T08:00:00Z"}
        modules = self.make(
            {"run": [], "stop": ["flowable"]}, {"flowable": flowable, "bootstrap": bootstrap}, hold_until="bootstrap"
        )
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": []})
        bootstrap.update(Running=True, Status="running")
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": []})
        bootstrap.update(Running=False, Status="exited", ExitCode=1, FinishedAt="2026-10-30T08:05:00Z")
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": []})
        bootstrap.update(ExitCode=0)
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": ["flowable"]})

    async def test_waits_while_bootstrap_not_created(self):
        modules = self.make({"run": [], "stop": ["kafka"]}, {"kafka": True}, hold_until="bootstrap")
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": []})

    async def test_waits_for_seed_too(self):
        """Bootstrap xong trước seed (seed mới cài mô-đun demo): chưa dừng dịch vụ cho tới khi seed cũng xong."""
        ai = {"Running": True, "StartedAt": "2026-10-30T08:00:00Z"}
        bootstrap = {"Running": False, "Status": "exited", "ExitCode": 0, "FinishedAt": "2026-10-30T08:05:00Z"}
        seed = {"Running": True, "Status": "running"}
        modules = self.make(
            {"run": [], "stop": ["kafka"]},
            {"kafka": ai, "bootstrap": bootstrap, "seed": seed},
            hold_until="bootstrap, seed",
        )
        self.assertTrue(await modules.starting())
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": []})
        seed.update(Running=False, Status="exited", ExitCode=0, FinishedAt="2026-10-30T08:06:00Z")
        self.assertFalse(await modules.starting())
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": ["kafka"]})

    async def test_idle_targets_do_not_sleep_during_startup(self):
        docker = FakeDocker(free_port())
        await docker.start("cid")
        target = Target(free_port(), "127.0.0.1", docker.upstream_port, idle_seconds=0)
        jobs = ManyDocker({"bootstrap": {"Running": True, "Status": "running"}})
        modules = Modules(jobs, "http://actions:8000/modules/services", {"kafka"}, [], hold_until="bootstrap")
        sleeper = Sleeper(docker, [target], wake_timeout=5, check_every=0.05, modules=modules)
        watcher = asyncio.create_task(sleeper.watch())
        await asyncio.sleep(0.3)
        self.assertEqual(docker.stopped, 0)
        jobs.running["bootstrap"] = {"Running": False, "Status": "exited", "ExitCode": 0}
        await asyncio.sleep(0.3)
        watcher.cancel()
        docker.server.close()
        self.assertEqual(docker.stopped, 1)

    async def test_service_started_by_sleeper_stops_without_waiting(self):
        desired = {"run": ["flowable"], "stop": []}
        modules = self.make(desired, {"flowable": False}, hold_until="bootstrap")
        self.assertEqual((await modules.reconcile())["started"], ["flowable"])
        desired.update(run=[], stop=["flowable"])
        self.assertEqual((await modules.reconcile())["stopped"], ["flowable"])

    async def test_ignores_services_not_managed(self):
        modules = self.make({"run": [], "stop": ["db", "kafka"]}, {"db": True, "kafka": True}, managed=("kafka",))
        await modules.reconcile()
        self.assertEqual(self.docker.calls, [("stop", "kafka")])

    async def test_keeps_state_when_actions_unreachable(self):
        modules = self.make(OSError("connection refused"), {"kafka": True})
        self.assertEqual(await modules.reconcile(), {"started": [], "stopped": []})
        self.assertEqual(self.docker.calls, [])

    async def test_status_reports_missing_container(self):
        modules = self.make({"run": [], "stop": []}, {"flowable": True})
        status = await modules.status()
        self.assertEqual(status["flowable"], {"running": True})
        self.assertEqual(status["kafka"], {"running": None})
        self.assertNotIn("trino-core", status)

    async def test_blocked_target_does_not_wake(self):
        docker = FakeDocker(free_port())
        target = Target(free_port(), "127.0.0.1", docker.upstream_port, 300, blocked=True)
        server = await asyncio.start_server(
            lambda r, w: target.handle(r, w, docker, 5), "127.0.0.1", target.listen_port
        )
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", target.listen_port)
            writer.write(b"x")
            await writer.drain()
            self.assertEqual(await asyncio.wait_for(reader.read(10), 5), b"")
            writer.close()
            self.assertEqual(docker.started, 0)
        finally:
            server.close()

    async def test_http_get_json(self):
        async def reply(reader, writer):
            await reader.readline()
            writer.write(b'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{"run": ["a"]}')
            await writer.drain()
            writer.close()

        port = free_port()
        server = await asyncio.start_server(reply, "127.0.0.1", port)
        try:
            self.assertEqual(await http_get_json(f"http://127.0.0.1:{port}/modules/services"), {"run": ["a"]})
        finally:
            server.close()


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
