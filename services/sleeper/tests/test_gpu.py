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

"""Tự dùng GPU NVIDIA khi máy có (ADR #79), không có GPU thì chỉ chạy AI trên CPU khi đủ RAM (ADR #90); Docker Engine giả."""

import itertools
import unittest

from app.sleeper import GPU_REQUEST, AiRam, DockerError, Gpu, Modules, Target, clone_body, has_gpu


class FakeEngine:
    """Docker giả: container theo id, tìm theo nhãn compose; `gpu_ok` quyết định container xin GPU start được không."""

    def __init__(self, gpu_ok: bool, ram_gb: float = 16):
        self.project = "bamboo"
        self.gpu_ok = gpu_ok
        self.ram = int(ram_gb * 2**30)
        self.ids = itertools.count(1)
        self.c: dict[str, dict] = {}
        self.log: list[str] = []

    def add(self, service: str, running=True, gpu=False, health="healthy") -> str:
        cid = f"c{next(self.ids)}"
        self.c[cid] = {
            "Id": cid + "0" * 20,
            "Name": f"/bamboo-{service}-1",
            "Config": {"Image": f"img-{service}", "Hostname": (cid + "0" * 20)[:12], "Labels": {"svc": service}},
            "HostConfig": {
                "DeviceRequests": [GPU_REQUEST] if gpu else None,
                "RestartPolicy": {"Name": "unless-stopped"},
            },
            "NetworkSettings": {"Networks": {"bamboo_default": {"Aliases": [service], "IPAddress": "10.0.0.5"}}},
            "State": {"Running": running, "Health": {"Status": health}},
        }
        return cid

    def _get(self, cid):
        for key, info in self.c.items():
            if cid in (key, info["Id"], info["Name"].lstrip("/")):
                return key
        raise DockerError(f"không có {cid}")

    async def find(self, service):
        found = [k for k, i in self.c.items() if (i["Config"].get("Labels") or {}).get("svc") == service]
        found.sort(key=lambda k: self.c[k]["Name"].endswith(("-sleeper-old", "-sleeper-new")))
        if not found:
            raise DockerError("không thấy")
        return found[0]

    async def inspect(self, cid):
        return self.c[self._get(cid)]

    async def state(self, cid):
        return self.c[self._get(cid)]["State"]

    async def start(self, cid):
        info = self.c[self._get(cid)]
        if has_gpu(info) and not self.gpu_ok:
            info["State"] = {"Running": False, "Error": "could not select device driver nvidia"}
            raise DockerError("could not select device driver nvidia")
        info["State"] = {"Running": True, "Health": {"Status": "healthy"}}
        self.log.append(f"start {info['Name']}")

    async def stop(self, cid, grace=30):
        self.c[self._get(cid)]["State"] = {"Running": False}

    async def create(self, name, body):
        cid = f"c{next(self.ids)}"
        self.c[cid] = {
            "Id": cid + "0" * 20,
            "Name": "/" + name,
            "Config": {k: v for k, v in body.items() if k not in ("HostConfig", "NetworkingConfig")},
            "HostConfig": body["HostConfig"],
            "NetworkSettings": {"Networks": body.get("NetworkingConfig", {}).get("EndpointsConfig", {})},
            "State": {"Running": False},
        }
        self.log.append(f"create {name}")
        return cid

    async def rename(self, cid, name):
        self.c[self._get(cid)]["Name"] = "/" + name

    async def remove(self, cid):
        try:
            del self.c[self._get(cid)]
        except DockerError:
            pass

    async def wait(self, cid):
        return 0

    async def mem_total(self):
        return self.ram


def services(engine):
    return {i["Name"]: has_gpu(i) for i in engine.c.values()}


class GpuTest(unittest.IsolatedAsyncioTestCase):
    def gpu(self, engine, **kw):
        return Gpu(engine, ["ollama-core", "ocr-core"], [Target(1, "ollama-core", 11434, 300)], **kw)

    async def test_co_gpu_thi_doi_sang_gpu_giu_ten_va_trang_thai(self):
        e = FakeEngine(gpu_ok=True)
        e.add("ai-worker")
        e.add("ollama-core", running=True)
        e.add("ocr-core", running=False)
        changed = await self.gpu(e).reconcile()
        self.assertEqual(changed, ["ollama-core", "ocr-core"])
        self.assertEqual(
            services(e), {"/bamboo-ai-worker-1": False, "/bamboo-ollama-core-1": True, "/bamboo-ocr-core-1": True}
        )
        ollama = await e.inspect("bamboo-ollama-core-1")
        self.assertTrue(ollama["State"]["Running"], "đang chạy thì bản GPU cũng chạy")
        self.assertFalse((await e.inspect("bamboo-ocr-core-1"))["State"]["Running"], "đang ngủ thì để ngủ")
        self.assertEqual(ollama["Config"]["Labels"], {"svc": "ollama-core"}, "giữ nhãn compose")
        self.assertNotIn("bamboo-gpu-probe", [i["Name"] for i in e.c.values()], "xóa container thử")
        self.assertEqual(await self.gpu(e).reconcile(), [], "đã có GPU thì không đổi nữa")

    async def test_khong_co_gpu_thi_giu_cpu(self):
        e = FakeEngine(gpu_ok=False)
        e.add("ai-worker")
        e.add("ollama-core")
        e.add("ocr-core")
        gpu = self.gpu(e)
        self.assertEqual(await gpu.reconcile(), [])
        self.assertFalse(gpu.usable)
        self.assertEqual(set(services(e).values()), {False})
        self.assertFalse([x for x in e.log if "create bamboo-ollama" in x], "không đụng tới container thật")
        self.assertTrue(all(i["State"]["Running"] for i in e.c.values()))

    async def test_image_can_chuan_bi_thi_chay_lenh_truoc_khi_doi(self):
        e = FakeEngine(gpu_ok=True)
        e.add("ai-worker")
        e.add("ollama-core")
        ocr = e.add("ocr-core")
        e.c[ocr]["Config"]["Labels"]["bamboo.gpu.prepare"] = "python -m app.accel"
        e.c[ocr]["HostConfig"]["Binds"] = ["bamboo_ocr-accel:/opt/accel"]
        gpu = self.gpu(e)
        self.assertEqual(await gpu.reconcile(), ["ollama-core"], "OCR chờ chuẩn bị xong")
        job = await e.inspect("bamboo-ocr-core-gpu-prepare")
        self.assertEqual(job["Config"]["Cmd"], ["python", "-m", "app.accel"])
        self.assertEqual(job["Config"]["Labels"], {"bamboo.sleeper": "gpu-prepare"}, "không mang nhãn compose")
        self.assertEqual(job["HostConfig"]["Binds"], ["bamboo_ocr-accel:/opt/accel"], "cùng volume")
        self.assertFalse(has_gpu(job))
        self.assertEqual(job["NetworkSettings"]["Networks"], {"bamboo_default": {}}, "không mang alias dịch vụ")
        self.assertEqual(await gpu.reconcile(), [], "đang tải thì chưa đổi")
        self.assertFalse(has_gpu(await e.inspect("bamboo-ocr-core-1")))
        job["State"] = {"Running": False, "ExitCode": 0}
        self.assertEqual(await gpu.reconcile(), ["ocr-core"])
        self.assertTrue(has_gpu(await e.inspect("bamboo-ocr-core-1")))
        self.assertNotIn("/bamboo-ocr-core-gpu-prepare", [i["Name"] for i in e.c.values()], "xóa container chuẩn bị")

    async def test_chuan_bi_loi_thi_giu_cpu(self):
        e = FakeEngine(gpu_ok=True)
        e.add("ai-worker")
        ocr = e.add("ocr-core")
        e.c[ocr]["Config"]["Labels"]["bamboo.gpu.prepare"] = "python -m app.accel"
        gpu = Gpu(e, ["ocr-core"], [])
        self.assertEqual(await gpu.reconcile(), [])
        (await e.inspect("bamboo-ocr-core-gpu-prepare"))["State"] = {"Running": False, "ExitCode": 1}
        self.assertEqual(await gpu.reconcile(), [])
        self.assertEqual(await gpu.reconcile(), [], "không thử lại cho tới khi sleeper khởi động lại")
        self.assertFalse(has_gpu(await e.inspect("bamboo-ocr-core-1")))
        self.assertTrue((await e.inspect("bamboo-ocr-core-1"))["State"]["Running"])
        self.assertEqual(len(e.c), 2, "không để lại container thừa")

    async def test_cho_compose_xong_moi_doi(self):
        e = FakeEngine(gpu_ok=True)
        e.add("ollama-core")
        self.assertEqual(await self.gpu(e).reconcile(), [])
        self.assertFalse(has_gpu(await e.inspect("bamboo-ollama-core-1")))

    async def test_tat_bang_bien(self):
        e = FakeEngine(gpu_ok=True)
        e.add("ai-worker")
        e.add("ollama-core")
        self.assertEqual(await self.gpu(e, mode="false").reconcile(), [])

    async def test_gpu_hong_ve_sau_thi_ve_cpu(self):
        e = FakeEngine(gpu_ok=False)
        e.add("ai-worker")
        cid = e.add("ollama-core", running=False, gpu=True)
        e.c[cid]["State"] = {"Running": False, "Error": "could not select device driver nvidia"}
        gpu = self.gpu(e)
        self.assertEqual(await gpu.reconcile(), ["ollama-core"])
        self.assertFalse(has_gpu(await e.inspect("bamboo-ollama-core-1")))
        self.assertEqual(await gpu.reconcile(), [], "không đổi qua lại")

    async def test_ban_moi_khong_len_thi_tra_ban_cu(self):
        e = FakeEngine(gpu_ok=True)
        e.add("ai-worker")
        e.add("ollama-core")
        gpu = self.gpu(e)
        gpu.usable = True

        async def broken(_cid):
            return False

        gpu._verify = broken
        self.assertEqual(await gpu.reconcile(), [])
        info = await e.inspect("bamboo-ollama-core-1")
        self.assertFalse(has_gpu(info))
        self.assertTrue(info["State"]["Running"], "bản CPU chạy lại")
        self.assertEqual(len([i for i in e.c.values() if "ollama" in i["Name"]]), 1)

    def test_clone_body(self):
        info = {
            "Id": "abcdef1234567890",
            "Config": {"Image": "x", "Hostname": "abcdef123456", "Env": ["A=1"], "Labels": {"l": "1"}},
            "HostConfig": {"Binds": ["v:/data"], "DeviceRequests": None},
            "NetworkSettings": {"Networks": {"n": {"Aliases": ["svc"], "IPAddress": "1.2.3.4", "EndpointID": "e"}}},
        }
        body = clone_body(info, gpu=True)
        self.assertNotIn("Hostname", body)
        self.assertEqual(body["Env"], ["A=1"])
        self.assertEqual(body["HostConfig"]["Binds"], ["v:/data"])
        self.assertEqual(body["HostConfig"]["DeviceRequests"], [GPU_REQUEST])
        self.assertEqual(body["NetworkingConfig"], {"EndpointsConfig": {"n": {"Aliases": ["svc"]}}})
        self.assertEqual(
            clone_body({**info, "HostConfig": body["HostConfig"]}, gpu=False)["HostConfig"]["DeviceRequests"], []
        )


AI = ["ollama-core", "ocr-core", "ai-worker"]


class AiRamTest(unittest.IsolatedAsyncioTestCase):
    def setup(self, gpu_ok: bool, ram_gb: float, mode="auto"):
        e = FakeEngine(gpu_ok=gpu_ok, ram_gb=ram_gb)
        for service in AI:
            e.add(service)
        targets = [Target(1, "ollama-core", 11434, 300), Target(2, "ocr-core", 8000, 300)]
        gpu = Gpu(e, ["ollama-core", "ocr-core"], targets, mode) if mode != "false" else None
        return e, gpu, AiRam(e, AI, targets, 7 * 1024, gpu), targets

    async def running(self, e, service):
        return (await e.state(await e.find(service))).get("Running")

    async def test_chua_do_xong_gpu_thi_chua_quyet(self):
        e, _gpu, ai, _ = self.setup(gpu_ok=False, ram_gb=4)
        await ai.reconcile()
        self.assertEqual(ai.status()["device"], "pending")
        self.assertTrue(await self.running(e, "ollama-core"))

    async def test_co_gpu_thi_khong_xet_ram(self):
        e, gpu, ai, _ = self.setup(gpu_ok=True, ram_gb=4)
        await gpu.reconcile()
        await ai.reconcile()
        self.assertEqual(ai.status()["device"], "gpu")
        self.assertEqual(ai.off(), set())

    async def test_khong_gpu_du_ram_thi_chay_cpu(self):
        e, gpu, ai, targets = self.setup(gpu_ok=False, ram_gb=7.6)
        await gpu.reconcile()
        await ai.reconcile()
        self.assertEqual(ai.status(), {"device": "cpu", "ram_mb": 7782, "min_ram_mb": 7168})
        self.assertTrue(await self.running(e, "ai-worker"))
        self.assertFalse(any(t.blocked for t in targets))

    async def test_khong_gpu_thieu_ram_thi_tat_ai(self):
        e, gpu, ai, targets = self.setup(gpu_ok=False, ram_gb=5.8)
        await gpu.reconcile()
        await ai.reconcile()
        self.assertEqual(ai.status()["device"], "off")
        self.assertEqual(ai.off(), set(AI))
        for service in AI:
            self.assertFalse(await self.running(e, service), service)
        self.assertTrue(all(t.blocked for t in targets), "không đánh thức Ollama, OCR")

    async def test_tat_gpu_bang_bien_thi_xet_ram_ngay(self):
        e, _gpu, ai, _ = self.setup(gpu_ok=True, ram_gb=5.8, mode="false")
        await ai.reconcile()
        self.assertEqual(ai.status()["device"], "off")

    async def test_mo_dun_khong_chay_lai_dich_vu_ai_da_tat(self):
        e, gpu, ai, targets = self.setup(gpu_ok=False, ram_gb=5.8)
        await gpu.reconcile()
        await ai.reconcile()

        async def fetch(_url):
            return {"run": AI, "stop": []}

        modules = Modules(e, "http://actions", set(AI), targets, fetch, forced_off=ai.off)
        done = await modules.reconcile()
        self.assertEqual(done["started"], [])
        for service in AI:
            self.assertFalse(await self.running(e, service), service)
        self.assertTrue(all(t.blocked for t in targets))
