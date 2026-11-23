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

"""Số liệu Prometheus và truy vết OpenTelemetry (ADR #75)."""

import http.server
import threading

import pytest
from fastapi.testclient import TestClient

from app import config, main, telemetry
from conftest import SETTINGS, TEST_APP_DB_URL


@pytest.fixture
def client(database):
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": TEST_APP_DB_URL})
    with TestClient(main.create_app(settings)) as c:
        yield c


def _value(text: str, line_start: str) -> float | None:
    for line in text.splitlines():
        if line.startswith(line_start):
            return float(line.rsplit(" ", 1)[1])
    return None


def test_metrics_dem_route_action_va_hang_doi(client, conn):
    conn.execute("UPDATE core.ai_question SET status = 'error' WHERE status IN ('queued', 'running')")
    before = client.get("/metrics").text
    client.get("/healthz")
    payload = {"action": {"name": "khong_co"}, "input": {}, "session_variables": {}}
    r = client.post("/actions/khong_co", json=payload, headers={"x-actions-secret": SETTINGS.actions_secret})
    assert r.status_code == 404
    text = client.get("/metrics").text
    assert 'bamboo_action_calls_total{action="khong_co",outcome="rejected"}' in text
    route = 'bamboo_http_requests_total{method="POST",route="/actions/{name}",status="404"}'
    assert (_value(text, route) or 0) == (_value(before, route) or 0) + 1, "đếm theo mẫu route, không theo tên Action"
    assert 'route="/healthz"' not in text and 'route="/metrics"' not in text, "không đếm kiểm tra sức khỏe"
    for name in ("bamboo_message_queue", "bamboo_attachments_pending", "bamboo_ocr_pending"):
        assert f"# TYPE {name} gauge" in text, name
    assert _value(text, "bamboo_attachments_pending ") is not None


class _Collector(http.server.BaseHTTPRequestHandler):
    received: list[bytes] = []

    def log_message(self, *_):
        pass

    def do_POST(self):
        _Collector.received.append(self.rfile.read(int(self.headers["Content-Length"])))
        self.send_response(200)
        self.end_headers()


def test_truy_vet_otlp_gan_ma_yeu_cau(database, monkeypatch):
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Collector)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", f"http://127.0.0.1:{server.server_address[1]}")
    monkeypatch.setenv("OTEL_SERVICE_NAME", "bamboo-actions-test")
    if telemetry._TRACING:
        pytest.skip("tiến trình đã bật truy vết với cấu hình khác")
    settings = config.Settings(**{**SETTINGS.__dict__, "database_url": TEST_APP_DB_URL})
    from opentelemetry import trace

    with TestClient(main.create_app(settings)) as c:
        r = c.get("/modules/services", headers={"x-request-id": "req-abc-123"})
        assert r.status_code == 200 and len(r.headers["x-trace-id"]) == 32
        trace.get_tracer_provider().force_flush()
    server.shutdown()
    body = b"".join(_Collector.received)
    assert b"bamboo-actions-test" in body, "resource service.name"
    assert b"req-abc-123" in body, "span gắn X-Request-Id của cổng API"
    assert b"/modules/services" in body and b"SELECT" in body, "span HTTP và span SQL con"
