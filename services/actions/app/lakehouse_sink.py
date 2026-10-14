# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import datetime as dt
import json
import logging
import re
import time

from . import config

log = logging.getLogger("lakehouse_sink")

NAMESPACE = "bronze"
TOPIC_PATTERN = re.compile(r"^bms\.(core|mdm|wf|proc|ic|mfg|collab)\.[a-z0-9_]+$")
OFFSETS_PROPERTY = "kafka.offsets"
MAX_BATCH = 5000
FLUSH_SECONDS = 30.0
TOPIC_REFRESH_SECONDS = 60.0


def table_name(topic: str) -> str:
    _, schema, table = topic.split(".", 2)
    return f"{NAMESPACE}.{schema}_{table}"


BRONZE_COLUMNS = [
    ("op", "varchar"),
    ("source_ts", "timestamp(6) with time zone"),
    ("source_date", "date"),
    ("lsn", "bigint"),
    ("tx_id", "bigint"),
    ("tenant_id", "varchar"),
    ("record_key", "varchar"),
    ("before", "varchar"),
    ("after", "varchar"),
    ("kafka_partition", "integer"),
    ("kafka_offset", "bigint"),
    ("ingested_at", "timestamp(6) with time zone"),
]


def arrow_schema():
    import pyarrow as pa

    ts = pa.timestamp("us", tz="UTC")
    return pa.schema(
        [
            pa.field("op", pa.string(), nullable=False),
            pa.field("source_ts", ts, nullable=False),
            pa.field("source_date", pa.date32(), nullable=False),
            pa.field("lsn", pa.int64()),
            pa.field("tx_id", pa.int64()),
            pa.field("tenant_id", pa.string()),
            pa.field("record_key", pa.string(), nullable=False),
            pa.field("before", pa.string()),
            pa.field("after", pa.string()),
            pa.field("kafka_partition", pa.int32(), nullable=False),
            pa.field("kafka_offset", pa.int64(), nullable=False),
            pa.field("ingested_at", ts, nullable=False),
        ]
    )


def to_row(partition: int, offset: int, key: bytes | None, value: bytes, now: dt.datetime) -> dict:
    event = json.loads(value)
    source = event.get("source") or {}
    image = event.get("after") or event.get("before") or {}
    ts_us = source.get("ts_us") or (source.get("ts_ms") or event.get("ts_ms")) * 1000
    source_ts = dt.datetime.fromtimestamp(ts_us / 1_000_000, tz=dt.UTC)
    return {
        "op": event["op"],
        "source_ts": source_ts,
        "source_date": source_ts.date(),
        "lsn": source.get("lsn"),
        "tx_id": source.get("txId"),
        "tenant_id": image.get("tenant_id"),
        "record_key": key.decode() if key else json.dumps({"id": image.get("id")}),
        "before": json.dumps(event["before"], ensure_ascii=False) if event.get("before") is not None else None,
        "after": json.dumps(event["after"], ensure_ascii=False) if event.get("after") is not None else None,
        "kafka_partition": partition,
        "kafka_offset": offset,
        "ingested_at": now,
    }


def catalog(settings: config.Settings, warehouse: str = "warehouse"):
    from pyiceberg.catalog.sql import SqlCatalog

    return SqlCatalog(
        "bms",
        uri=settings.lakehouse_catalog_url,
        warehouse=f"s3://{settings.s3_lakehouse_bucket}/{warehouse}",
        **{
            "s3.endpoint": settings.s3_endpoint,
            "s3.access-key-id": settings.s3_lakehouse_access_key,
            "s3.secret-access-key": settings.s3_lakehouse_secret_key,
            "s3.region": settings.s3_region,
            "s3.path-style-access": "true",
        },
    )


def ensure_table(cat, name: str):
    from pyiceberg.exceptions import TableAlreadyExistsError
    from pyiceberg.transforms import IdentityTransform

    cat.create_namespace_if_not_exists(NAMESPACE)
    if cat.table_exists(name):
        return cat.load_table(name)
    try:
        table = cat.create_table(name, schema=arrow_schema(), properties={"format-version": "2"})
    except TableAlreadyExistsError:
        return cat.load_table(name)
    with table.update_spec() as spec:
        spec.add_field("source_date", IdentityTransform(), "source_date")
    log.info("đã tạo bảng %s", name)
    return cat.load_table(name)


def committed_offsets(table) -> dict[int, int]:
    snapshot = table.current_snapshot()
    if snapshot is None or snapshot.summary is None:
        return {}
    raw = snapshot.summary.get(OFFSETS_PROPERTY)
    return {int(p): int(o) for p, o in json.loads(raw).items()} if raw else {}


def write_batch(table, rows: list[dict], next_offsets: dict[int, int]) -> None:
    import pyarrow as pa

    data = pa.Table.from_pylist(rows, schema=arrow_schema())
    table.append(
        data, snapshot_properties={OFFSETS_PROPERTY: json.dumps({str(p): o for p, o in sorted(next_offsets.items())})}
    )


class Sink:
    def __init__(self, settings: config.Settings, consumer=None, cat=None):
        import kafka

        self.settings = settings
        self.catalog = cat or catalog(settings)
        self.consumer = consumer or kafka.KafkaConsumer(
            **config.kafka_options(settings),
            enable_auto_commit=False,
            group_id=None,
            auto_offset_reset="earliest",
            max_poll_records=MAX_BATCH,
            consumer_timeout_ms=1000,
        )
        self.tables: dict[str, object] = {}
        self.assigned: set = set()
        self.last_refresh = 0.0

    def refresh_assignment(self) -> None:
        import kafka

        topics = sorted(t for t in self.consumer.topics() if TOPIC_PATTERN.match(t))
        parts = []
        for topic in topics:
            for p in sorted(self.consumer.partitions_for_topic(topic) or ()):
                parts.append(kafka.TopicPartition(topic, p))
        new = [tp for tp in parts if tp not in self.assigned]
        if new or len(parts) != len(self.assigned):
            self.consumer.assign(parts)
            for tp in parts:
                table = self.table(tp.topic)
                start = committed_offsets(table).get(tp.partition)
                if start is None:
                    self.consumer.seek_to_beginning(tp)
                else:
                    self.consumer.seek(tp, start)
            self.assigned = set(parts)
            log.info("đọc %s topic, %s partition", len(topics), len(parts))
        self.last_refresh = time.monotonic()

    def table(self, topic: str):
        if topic not in self.tables:
            self.tables[topic] = ensure_table(self.catalog, table_name(topic))
        return self.tables[topic]

    def run_once(self, wait_seconds: float = FLUSH_SECONDS, stop_when_idle: bool = False) -> int:
        if time.monotonic() - self.last_refresh > TOPIC_REFRESH_SECONDS or not self.assigned:
            self.refresh_assignment()
        pending: dict[str, list[dict]] = {}
        offsets: dict[str, dict[int, int]] = {}
        deadline = time.monotonic() + wait_seconds
        count = 0
        now = dt.datetime.now(dt.UTC)
        idle = 0
        while count < MAX_BATCH and time.monotonic() < deadline:
            batch = self.consumer.poll(timeout_ms=500, max_records=MAX_BATCH - count)
            if not batch:
                idle += 1
                if stop_when_idle and idle >= 3:
                    break
                continue
            idle = 0
            for tp, records in batch.items():
                for rec in records:
                    offsets.setdefault(tp.topic, {})[tp.partition] = rec.offset + 1
                    if rec.value is None:
                        continue
                    pending.setdefault(tp.topic, []).append(to_row(tp.partition, rec.offset, rec.key, rec.value, now))
                    count += 1
        for topic, rows in pending.items():
            table = self.table(topic)
            write_batch(table, rows, {**committed_offsets(table), **offsets[topic]})
        if count:
            log.info("đã ghi %s thay đổi vào %s bảng", count, len(pending))
        return count


def run_forever(settings: config.Settings) -> None:
    while True:
        try:
            sink = Sink(settings)
            break
        except Exception as exc:  # noqa: BLE001
            log.warning("chờ Kafka/catalog: %s", exc)
            time.sleep(5)
    log.info("lakehouse-sink đang chạy")
    while True:
        try:
            sink.run_once()
        except Exception as exc:  # noqa: BLE001
            log.warning("lakehouse-sink lỗi, thử lại từ vị trí đã ghi: %s", exc)
            sink.assigned = set()
            sink.tables = {}
            time.sleep(10)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("kafka").setLevel(logging.WARNING)
    run_forever(config.load())
