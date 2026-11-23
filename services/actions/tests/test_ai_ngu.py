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

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from app.gpu import OCR_SERVICE, OLLAMA_SERVICE, Gpu, placement, sleeper_awake


class FakeOllama:
    def __init__(self, running):
        self.loaded = running
        self.unloaded = []

    def running(self):
        return [{"name": n, "size": 1, "size_vram": 0} for n in self.loaded]

    def unload(self, model):
        self.unloaded.append(model)


class FakeOcr:
    def __init__(self):
        self.unloads = 0

    def unload(self):
        self.unloads += 1


@pytest.fixture
def sleeper_status():
    status = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            body = json.dumps(status).encode()
            self.send_response(200 if self.path == "/status" else 404)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield status, f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


def test_sleeper_awake_reads_status(sleeper_status):
    status, url = sleeper_status
    status.update({OCR_SERVICE: {"running": False}, OLLAMA_SERVICE: {"running": True}})
    awake = sleeper_awake(url)
    assert awake(OLLAMA_SERVICE) is True
    assert awake(OCR_SERVICE) is False
    assert awake("khong-co") is True


def test_sleeper_awake_defaults_to_running():
    assert sleeper_awake("")(OCR_SERVICE) is True
    assert sleeper_awake("http://127.0.0.1:9")(OCR_SERVICE) is True


def test_cold_chat_does_not_wake_sleeping_ocr():
    ai, ocr = FakeOllama(["khac:latest"]), FakeOcr()
    gpu = Gpu(ai, ocr, awake=lambda service: service != OCR_SERVICE)
    assert gpu.ensure_chat("qwen3:4b") is True
    assert ocr.unloads == 0
    assert ai.unloaded == ["khac:latest"]
    Gpu(ai, ocr).ensure_chat("qwen3:4b")
    assert ocr.unloads == 1


def test_free_for_ocr_skips_sleeping_ollama():
    ai = FakeOllama(["qwen3:4b"])
    Gpu(ai, FakeOcr(), awake=lambda service: service != OLLAMA_SERVICE).free_for_ocr()
    assert ai.unloaded == []
    Gpu(ai, FakeOcr()).free_for_ocr()
    assert ai.unloaded == ["qwen3:4b"]


def test_placement_reports_where_the_model_runs():
    gb = 2**30
    running = [
        {"name": "qwen3:4b", "size": 4 * gb, "size_vram": 4 * gb},
        {"name": "big:latest", "size": 10 * gb, "size_vram": 6 * gb},
        {"name": "bge-m3:latest", "size": gb, "size_vram": 0},
    ]
    assert placement(running, "qwen3:4b") == "GPU"
    assert placement(running, "big") == "60% trên GPU, phần còn lại trên CPU (thiếu VRAM)"
    assert placement(running, "bge-m3") == "CPU"
    assert placement(running, "khong-nap") == "chưa rõ"
