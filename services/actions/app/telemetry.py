# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Số liệu Prometheus và truy vết OpenTelemetry (ADR #75).

- `/metrics` (chỉ mạng nội bộ, cổng API không định tuyến): lượt gọi và thời gian theo route HTTP và theo Action, cùng
  độ sâu các hàng đợi đọc từ CSDL lúc Prometheus hỏi (thông báo chờ gửi/hàng chết, lượt hỏi AI, lần tự hành động của
  tác tử, tệp đang kiểm dịch, OCR, thiết bị trực tiếp ngoại tuyến).
- Truy vết: bật khi có `OTEL_EXPORTER_OTLP_ENDPOINT` (OTel Collector của nhóm dịch vụ observability). Mỗi yêu cầu HTTP
  là một span (tiếp tục traceparent nếu có), kèm span con cho câu lệnh SQL và lời gọi HTTP ra ngoài; span gắn
  `bamboo.request_id` = X-Request-Id của cổng API để tra chéo với nhật ký tập trung (obs.log_event).
"""

import logging
import os

from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest
from prometheus_client.core import GaugeMetricFamily

log = logging.getLogger("telemetry")

REGISTRY = CollectorRegistry(auto_describe=True)
BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60)
HTTP_REQUESTS = Counter(
    "bamboo_http_requests_total", "Yêu cầu HTTP tới actions", ["method", "route", "status"], registry=REGISTRY
)
HTTP_SECONDS = Histogram(
    "bamboo_http_request_duration_seconds",
    "Thời gian xử lý yêu cầu HTTP",
    ["method", "route"],
    buckets=BUCKETS,
    registry=REGISTRY,
)
ACTION_CALLS = Counter(
    "bamboo_action_calls_total", "Lượt gọi Action theo kết quả (ok, rejected, error)", ["action", "outcome"],
    registry=REGISTRY,
)  # fmt: skip
ACTION_SECONDS = Histogram(
    "bamboo_action_duration_seconds", "Thời gian chạy Action", ["action"], buckets=BUCKETS, registry=REGISTRY
)

# (tên số liệu, mô tả, nhãn, câu SQL trả (nhãn..., giá trị))
QUEUE_QUERIES = (
    (
        "bamboo_message_queue",
        "Tin trong hàng đợi chống chối bỏ theo trạng thái",
        ["status"],
        "SELECT status, count(*) FROM msg.queue WHERE status IN ('PENDING', 'LEASED', 'DEAD') GROUP BY status",
    ),
    (
        "bamboo_ai_questions",
        "Lượt hỏi Trợ lý AI đang chờ hoặc đang trả lời",
        ["status"],
        "SELECT status, count(*) FROM core.ai_question WHERE status IN ('queued', 'running') GROUP BY status",
    ),
    (
        "bamboo_ai_agent_runs",
        "Lần tự hành động của tác tử AI đang chờ hoặc đang chạy",
        ["status"],
        "SELECT status, count(*) FROM core.ai_agent_run WHERE status IN ('queued', 'running') GROUP BY status",
    ),
    (
        "bamboo_attachments_pending",
        "Tệp đang nằm trong bucket kiểm dịch chờ quét",
        [],
        "SELECT count(*) FROM core.attachment WHERE status = 'PENDING' AND deleted_at IS NULL",
    ),
    (
        "bamboo_ocr_pending",
        "Tệp chờ OCR",
        [],
        "SELECT count(*) FROM core.attachment_ocr WHERE status IN ('PENDING', 'RUNNING')",
    ),
    (
        "bamboo_iot_live_devices",
        "Thiết bị gửi số đo trực tiếp theo trạng thái kết nối",
        ["state"],
        "SELECT connection_state, count(*) FROM iot.entity WHERE live_source IS NOT NULL GROUP BY connection_state",
    ),
)


class QueueCollector:
    """Đọc độ sâu hàng đợi lúc Prometheus hỏi; CSDL lỗi thì bỏ qua (không làm hỏng /metrics)."""

    def __init__(self, pool_of):
        self.pool_of = pool_of

    def describe(self):
        return []

    def collect(self):
        try:
            with self.pool_of().connection(timeout=2) as conn:
                conn.execute("SET LOCAL statement_timeout = '2s'")
                for name, doc, labels, sql in QUEUE_QUERIES:
                    family = GaugeMetricFamily(name, doc, labels=labels)
                    rows = conn.execute(sql).fetchall()
                    for row in rows:
                        family.add_metric([str(v) for v in row[:-1]], float(row[-1]))
                    if not labels and not rows:
                        family.add_metric([], 0.0)
                    yield family
        except Exception as exc:  # noqa: BLE001
            log.warning("không đọc được số liệu hàng đợi: %s", exc)


_COLLECTOR: QueueCollector | None = None


def register_queue_collector(pool_of) -> None:
    """Đăng ký một lần cho cả tiến trình; gọi lại (ứng dụng tạo lại trong kiểm thử) chỉ đổi nguồn pool."""
    global _COLLECTOR
    if _COLLECTOR is None:
        _COLLECTOR = QueueCollector(pool_of)
        REGISTRY.register(_COLLECTOR)
    else:
        _COLLECTOR.pool_of = pool_of


def metrics_body() -> tuple[bytes, str]:
    return generate_latest(REGISTRY), CONTENT_TYPE_LATEST


def observe_http(method: str, route: str, status: int, seconds: float) -> None:
    HTTP_REQUESTS.labels(method, route, str(status)).inc()
    HTTP_SECONDS.labels(method, route).observe(seconds)


def observe_action(name: str, outcome: str, seconds: float) -> None:
    ACTION_CALLS.labels(name, outcome).inc()
    ACTION_SECONDS.labels(name).observe(seconds)


_TRACING = False


def setup_tracing(app, service: str) -> bool:
    """Bật OpenTelemetry khi có OTEL_EXPORTER_OTLP_ENDPOINT; trả về đã bật hay chưa."""
    global _TRACING
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return False
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    if not _TRACING:
        resource = Resource.create(
            {"service.name": os.environ.get("OTEL_SERVICE_NAME", service), "service.namespace": "bamboo"}
        )
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        trace.set_tracer_provider(provider)
        HTTPXClientInstrumentor().instrument()
        PsycopgInstrumentor().instrument(enable_commenter=False, skip_dep_check=True)
        _TRACING = True
    FastAPIInstrumentor.instrument_app(app, excluded_urls="healthz,metrics")
    log.info("đã bật truy vết OpenTelemetry (%s)", os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"])
    return True


def tag_request(request_id: str) -> str | None:
    """Gắn X-Request-Id vào span hiện tại; trả trace_id OpenTelemetry (hex) nếu đang truy vết."""
    if not _TRACING:
        return None
    from opentelemetry import trace

    span = trace.get_current_span()
    ctx = span.get_span_context()
    if not ctx.is_valid:
        return None
    span.set_attribute("bamboo.request_id", request_id)
    return format(ctx.trace_id, "032x")
