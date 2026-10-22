-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
-- SPDX-License-Identifier: Apache-2.0

CREATE SCHEMA IF NOT EXISTS lakehouse.bronze;
CREATE SCHEMA IF NOT EXISTS lakehouse.silver;

CREATE TABLE IF NOT EXISTS lakehouse.bronze.collab_comment (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.collab_comment COMMENT 'Trạng thái hiện tại của collab.comment, dựng từ bronze.collab_comment' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["entity_type"]') AS "entity_type",
    CAST(json_extract_scalar(after, '$["entity_id"]') AS uuid) AS "entity_id",
    CAST(json_extract_scalar(after, '$["parent_id"]') AS uuid) AS "parent_id",
    CAST(json_extract_scalar(after, '$["author_id"]') AS uuid) AS "author_id",
    json_extract_scalar(after, '$["body"]') AS "body",
    CAST(json_extract(after, '$["mentions"]') AS array(varchar)) AS "mentions",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["edited_at"]')) AS timestamp(6) with time zone) AS "edited_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["deleted_at"]')) AS timestamp(6) with time zone) AS "deleted_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.collab_comment
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.collab_kb_document (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.collab_kb_document COMMENT 'Trạng thái hiện tại của collab.kb_document, dựng từ bronze.collab_kb_document' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["doc_no"]') AS "doc_no",
    json_extract_scalar(after, '$["title"]') AS "title",
    json_extract_scalar(after, '$["category"]') AS "category",
    json_extract_scalar(after, '$["scope"]') AS "scope",
    json_extract_scalar(after, '$["summary"]') AS "summary",
    CAST(json_extract(after, '$["toc"]') AS array(varchar)) AS "toc",
    date_add('day', CAST(json_extract_scalar(after, '$["effective_date"]') AS integer), DATE '1970-01-01') AS "effective_date",
    CAST(json_extract_scalar(after, '$["version"]') AS integer) AS "version",
    CAST(json_extract_scalar(after, '$["supersedes_id"]') AS uuid) AS "supersedes_id",
    CAST(json_extract_scalar(after, '$["requester_id"]') AS uuid) AS "requester_id",
    CAST(json_extract_scalar(after, '$["requester_position_id"]') AS uuid) AS "requester_position_id",
    CAST(json_extract_scalar(after, '$["org_unit_id"]') AS uuid) AS "org_unit_id",
    json_extract_scalar(after, '$["status"]') AS "status",
    CAST(json_extract_scalar(after, '$["approval_round"]') AS integer) AS "approval_round",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["published_at"]')) AS timestamp(6) with time zone) AS "published_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["retired_at"]')) AS timestamp(6) with time zone) AS "retired_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.collab_kb_document
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.collab_notification (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.collab_notification COMMENT 'Trạng thái hiện tại của collab.notification, dựng từ bronze.collab_notification' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["recipient_id"]') AS uuid) AS "recipient_id",
    json_extract_scalar(after, '$["kind"]') AS "kind",
    json_extract_scalar(after, '$["entity_type"]') AS "entity_type",
    CAST(json_extract_scalar(after, '$["entity_id"]') AS uuid) AS "entity_id",
    json_extract_scalar(after, '$["title"]') AS "title",
    json_extract_scalar(after, '$["body"]') AS "body",
    CAST(json_extract_scalar(after, '$["actor_id"]') AS uuid) AS "actor_id",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["read_at"]')) AS timestamp(6) with time zone) AS "read_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.collab_notification
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_ai_agent (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_ai_agent COMMENT 'Trạng thái hiện tại của core.ai_agent, dựng từ bronze.core_ai_agent' AS
SELECT
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    json_extract_scalar(after, '$["name"]') AS "name",
    json_extract_scalar(after, '$["model"]') AS "model",
    json_extract_scalar(after, '$["status"]') AS "status",
    json_extract_scalar(after, '$["guardrail_config"]') AS "guardrail_config",
    json_extract_scalar(after, '$["tool_list"]') AS "tool_list",
    CAST(json_extract_scalar(after, '$["created_by"]') AS uuid) AS "created_by",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_ai_agent
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_ai_question (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_ai_question COMMENT 'Trạng thái hiện tại của core.ai_question, dựng từ bronze.core_ai_question' AS
SELECT
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["agent_id"]') AS uuid) AS "agent_id",
    CAST(json_extract_scalar(after, '$["person_id"]') AS uuid) AS "person_id",
    json_extract_scalar(after, '$["question"]') AS "question",
    CAST(json_extract_scalar(after, '$["kb_document_id"]') AS uuid) AS "kb_document_id",
    json_extract_scalar(after, '$["status"]') AS "status",
    json_extract_scalar(after, '$["answer"]') AS "answer",
    json_extract_scalar(after, '$["citations"]') AS "citations",
    json_extract_scalar(after, '$["guard"]') AS "guard",
    json_extract_scalar(after, '$["error"]') AS "error",
    json_extract_scalar(after, '$["model"]') AS "model",
    CAST(json_extract_scalar(after, '$["prompt_tokens"]') AS integer) AS "prompt_tokens",
    CAST(json_extract_scalar(after, '$["completion_tokens"]') AS integer) AS "completion_tokens",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["started_at"]')) AS timestamp(6) with time zone) AS "started_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["finished_at"]')) AS timestamp(6) with time zone) AS "finished_at",
    json_extract_scalar(after, '$["thinking"]') AS "thinking",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["first_token_at"]')) AS timestamp(6) with time zone) AS "first_token_at",
    CAST(json_extract_scalar(after, '$["cold_start"]') AS boolean) AS "cold_start",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_ai_question
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_assignment (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_assignment COMMENT 'Trạng thái hiện tại của core.assignment, dựng từ bronze.core_assignment' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["person_id"]') AS uuid) AS "person_id",
    CAST(json_extract_scalar(after, '$["position_id"]') AS uuid) AS "position_id",
    json_extract_scalar(after, '$["assignment_type"]') AS "assignment_type",
    json_extract_scalar(after, '$["valid_period"]') AS "valid_period",
    json_extract_scalar(after, '$["contract_no"]') AS "contract_no",
    json_extract_scalar(after, '$["contract_partner"]') AS "contract_partner",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_assignment
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_attachment (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_attachment COMMENT 'Trạng thái hiện tại của core.attachment, dựng từ bronze.core_attachment' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["entity_type"]') AS "entity_type",
    CAST(json_extract_scalar(after, '$["entity_id"]') AS uuid) AS "entity_id",
    json_extract_scalar(after, '$["file_name"]') AS "file_name",
    json_extract_scalar(after, '$["content_type"]') AS "content_type",
    CAST(json_extract_scalar(after, '$["size_bytes"]') AS bigint) AS "size_bytes",
    json_extract_scalar(after, '$["storage_key"]') AS "storage_key",
    json_extract_scalar(after, '$["status"]') AS "status",
    json_extract_scalar(after, '$["sha256"]') AS "sha256",
    json_extract_scalar(after, '$["scan_result"]') AS "scan_result",
    CAST(json_extract_scalar(after, '$["uploaded_by"]') AS uuid) AS "uploaded_by",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["scanned_at"]')) AS timestamp(6) with time zone) AS "scanned_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["deleted_at"]')) AS timestamp(6) with time zone) AS "deleted_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_attachment
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_attachment_ocr (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_attachment_ocr COMMENT 'Trạng thái hiện tại của core.attachment_ocr, dựng từ bronze.core_attachment_ocr' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["attachment_id"]') AS uuid) AS "attachment_id",
    json_extract_scalar(after, '$["status"]') AS "status",
    CAST(json_extract(after, '$["pages"]') AS array(varchar)) AS "pages",
    CAST(json_extract_scalar(after, '$["pages_total"]') AS integer) AS "pages_total",
    CAST(json_extract_scalar(after, '$["pages_done"]') AS integer) AS "pages_done",
    json_extract_scalar(after, '$["note"]') AS "note",
    json_extract_scalar(after, '$["error"]') AS "error",
    CAST(json_extract_scalar(after, '$["attempts"]') AS integer) AS "attempts",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["next_attempt_at"]')) AS timestamp(6) with time zone) AS "next_attempt_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_attachment_ocr
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_catalog_item (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_catalog_item COMMENT 'Trạng thái hiện tại của core.catalog_item, dựng từ bronze.core_catalog_item' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["catalog"]') AS "catalog",
    json_extract_scalar(after, '$["code"]') AS "code",
    json_extract_scalar(after, '$["name"]') AS "name",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_catalog_item
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_delegation (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_delegation COMMENT 'Trạng thái hiện tại của core.delegation, dựng từ bronze.core_delegation' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["delegator_id"]') AS uuid) AS "delegator_id",
    CAST(json_extract_scalar(after, '$["delegate_id"]') AS uuid) AS "delegate_id",
    CAST(json_extract_scalar(after, '$["position_id"]') AS uuid) AS "position_id",
    CAST(json_extract(after, '$["permission_codes"]') AS array(varchar)) AS "permission_codes",
    json_extract_scalar(after, '$["valid_period"]') AS "valid_period",
    json_extract_scalar(after, '$["reason"]') AS "reason",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_delegation
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_doc_sequence (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_doc_sequence COMMENT 'Trạng thái hiện tại của core.doc_sequence, dựng từ bronze.core_doc_sequence' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    json_extract_scalar(after, '$["prefix"]') AS "prefix",
    CAST(json_extract_scalar(after, '$["year"]') AS integer) AS "year",
    CAST(json_extract_scalar(after, '$["last_no"]') AS integer) AS "last_no",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_doc_sequence
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_org_unit (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_org_unit COMMENT 'Trạng thái hiện tại của core.org_unit, dựng từ bronze.core_org_unit' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["parent_id"]') AS uuid) AS "parent_id",
    CAST(json_extract_scalar(after, '$["unit_type_id"]') AS uuid) AS "unit_type_id",
    json_extract_scalar(after, '$["code"]') AS "code",
    json_extract_scalar(after, '$["name"]') AS "name",
    CAST(json_extract_scalar(after, '$["is_legal_entity"]') AS boolean) AS "is_legal_entity",
    json_extract_scalar(after, '$["path"]') AS "path",
    json_extract_scalar(after, '$["valid_period"]') AS "valid_period",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    json_extract_scalar(after, '$["province"]') AS "province",
    CAST(json_extract_scalar(after, '$["lat"]') AS decimal(8, 5)) AS "lat",
    CAST(json_extract_scalar(after, '$["lng"]') AS decimal(8, 5)) AS "lng",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_org_unit
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_permission (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_permission COMMENT 'Trạng thái hiện tại của core.permission, dựng từ bronze.core_permission' AS
SELECT
    json_extract_scalar(after, '$["code"]') AS "code",
    json_extract_scalar(after, '$["description"]') AS "description",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_permission
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_person (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_person COMMENT 'Trạng thái hiện tại của core.person, dựng từ bronze.core_person' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["idp_subject"]') AS "idp_subject",
    json_extract_scalar(after, '$["full_name"]') AS "full_name",
    json_extract_scalar(after, '$["employee_code"]') AS "employee_code",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_person
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_position (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_position COMMENT 'Trạng thái hiện tại của core.position, dựng từ bronze.core_position' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["org_unit_id"]') AS uuid) AS "org_unit_id",
    CAST(json_extract_scalar(after, '$["job_title_id"]') AS uuid) AS "job_title_id",
    json_extract_scalar(after, '$["name"]') AS "name",
    CAST(json_extract_scalar(after, '$["is_head"]') AS boolean) AS "is_head",
    CAST(json_extract_scalar(after, '$["reports_to_id"]') AS uuid) AS "reports_to_id",
    json_extract_scalar(after, '$["valid_period"]') AS "valid_period",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_position
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_role (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_role COMMENT 'Trạng thái hiện tại của core.role, dựng từ bronze.core_role' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["code"]') AS "code",
    json_extract_scalar(after, '$["name"]') AS "name",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_role
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_role_grant (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_role_grant COMMENT 'Trạng thái hiện tại của core.role_grant, dựng từ bronze.core_role_grant' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["role_id"]') AS uuid) AS "role_id",
    CAST(json_extract_scalar(after, '$["person_id"]') AS uuid) AS "person_id",
    CAST(json_extract_scalar(after, '$["position_id"]') AS uuid) AS "position_id",
    CAST(json_extract_scalar(after, '$["org_unit_id"]') AS uuid) AS "org_unit_id",
    CAST(json_extract_scalar(after, '$["team_id"]') AS uuid) AS "team_id",
    json_extract_scalar(after, '$["scope"]') AS "scope",
    CAST(json_extract_scalar(after, '$["scope_unit_id"]') AS uuid) AS "scope_unit_id",
    json_extract_scalar(after, '$["valid_period"]') AS "valid_period",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_role_grant
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_role_permission (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_role_permission COMMENT 'Trạng thái hiện tại của core.role_permission, dựng từ bronze.core_role_permission' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["role_id"]') AS uuid) AS "role_id",
    json_extract_scalar(after, '$["permission_code"]') AS "permission_code",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_role_permission
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_team (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_team COMMENT 'Trạng thái hiện tại của core.team, dựng từ bronze.core_team' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["name"]') AS "name",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_team
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_team_member (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_team_member COMMENT 'Trạng thái hiện tại của core.team_member, dựng từ bronze.core_team_member' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["team_id"]') AS uuid) AS "team_id",
    CAST(json_extract_scalar(after, '$["person_id"]') AS uuid) AS "person_id",
    json_extract_scalar(after, '$["valid_period"]') AS "valid_period",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_team_member
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_tenant (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_tenant COMMENT 'Trạng thái hiện tại của core.tenant, dựng từ bronze.core_tenant' AS
SELECT
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["code"]') AS "code",
    json_extract_scalar(after, '$["name"]') AS "name",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(json_extract_scalar(after, '$["storage_quota_bytes"]') AS bigint) AS "storage_quota_bytes",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_tenant
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.core_tenant_relation (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.core_tenant_relation COMMENT 'Trạng thái hiện tại của core.tenant_relation, dựng từ bronze.core_tenant_relation' AS
SELECT
    CAST(json_extract_scalar(after, '$["parent_tenant_id"]') AS uuid) AS "parent_tenant_id",
    CAST(json_extract_scalar(after, '$["child_tenant_id"]') AS uuid) AS "child_tenant_id",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.core_tenant_relation
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.ic_ic_order (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.ic_ic_order COMMENT 'Trạng thái hiện tại của ic.ic_order, dựng từ bronze.ic_ic_order' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["seller_unit_id"]') AS uuid) AS "seller_unit_id",
    CAST(json_extract_scalar(after, '$["buyer_unit_id"]') AS uuid) AS "buyer_unit_id",
    CAST(json_extract_scalar(after, '$["created_by"]') AS uuid) AS "created_by",
    CAST(json_extract_scalar(after, '$["total_amount"]') AS decimal(18, 2)) AS "total_amount",
    json_extract_scalar(after, '$["status"]') AS "status",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    json_extract_scalar(after, '$["doc_no"]') AS "doc_no",
    CAST(json_extract_scalar(after, '$["decided_by"]') AS uuid) AS "decided_by",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["decided_at"]')) AS timestamp(6) with time zone) AS "decided_at",
    json_extract_scalar(after, '$["decision_note"]') AS "decision_note",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.ic_ic_order
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.ic_ic_order_item (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.ic_ic_order_item COMMENT 'Trạng thái hiện tại của ic.ic_order_item, dựng từ bronze.ic_ic_order_item' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["order_id"]') AS uuid) AS "order_id",
    CAST(json_extract_scalar(after, '$["line_no"]') AS integer) AS "line_no",
    CAST(json_extract_scalar(after, '$["item_id"]') AS uuid) AS "item_id",
    json_extract_scalar(after, '$["description"]') AS "description",
    json_extract_scalar(after, '$["uom"]') AS "uom",
    CAST(json_extract_scalar(after, '$["quantity"]') AS decimal(18, 3)) AS "quantity",
    CAST(json_extract_scalar(after, '$["unit_price"]') AS decimal(18, 2)) AS "unit_price",
    CAST(json_extract_scalar(after, '$["lot_id"]') AS uuid) AS "lot_id",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.ic_ic_order_item
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.mdm_item (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.mdm_item COMMENT 'Trạng thái hiện tại của mdm.item, dựng từ bronze.mdm_item' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["code"]') AS "code",
    json_extract_scalar(after, '$["name"]') AS "name",
    json_extract_scalar(after, '$["uom"]') AS "uom",
    json_extract_scalar(after, '$["category_code"]') AS "category_code",
    CAST(json_extract_scalar(after, '$["ref_price"]') AS decimal(18, 2)) AS "ref_price",
    CAST(json_extract_scalar(after, '$["is_active"]') AS boolean) AS "is_active",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.mdm_item
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.mdm_partner (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.mdm_partner COMMENT 'Trạng thái hiện tại của mdm.partner, dựng từ bronze.mdm_partner' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["code"]') AS "code",
    json_extract_scalar(after, '$["name"]') AS "name",
    json_extract_scalar(after, '$["tax_code"]') AS "tax_code",
    json_extract_scalar(after, '$["address"]') AS "address",
    json_extract_scalar(after, '$["email"]') AS "email",
    json_extract_scalar(after, '$["phone"]') AS "phone",
    CAST(json_extract_scalar(after, '$["internal_unit_id"]') AS uuid) AS "internal_unit_id",
    CAST(json_extract_scalar(after, '$["is_active"]') AS boolean) AS "is_active",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.mdm_partner
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.mfg_lot (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.mfg_lot COMMENT 'Trạng thái hiện tại của mfg.lot, dựng từ bronze.mfg_lot' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["lot_no"]') AS "lot_no",
    CAST(json_extract_scalar(after, '$["item_id"]') AS uuid) AS "item_id",
    CAST(json_extract_scalar(after, '$["org_unit_id"]') AS uuid) AS "org_unit_id",
    CAST(json_extract_scalar(after, '$["quantity"]') AS decimal(18, 3)) AS "quantity",
    json_extract_scalar(after, '$["uom"]') AS "uom",
    date_add('day', CAST(json_extract_scalar(after, '$["produced_on"]') AS integer), DATE '1970-01-01') AS "produced_on",
    json_extract_scalar(after, '$["status"]') AS "status",
    json_extract_scalar(after, '$["note"]') AS "note",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.mfg_lot
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.proc_purchase_order (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.proc_purchase_order COMMENT 'Trạng thái hiện tại của proc.purchase_order, dựng từ bronze.proc_purchase_order' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["doc_no"]') AS "doc_no",
    CAST(json_extract_scalar(after, '$["request_id"]') AS uuid) AS "request_id",
    CAST(json_extract_scalar(after, '$["ic_order_id"]') AS uuid) AS "ic_order_id",
    CAST(json_extract_scalar(after, '$["partner_id"]') AS uuid) AS "partner_id",
    CAST(json_extract_scalar(after, '$["org_unit_id"]') AS uuid) AS "org_unit_id",
    CAST(json_extract_scalar(after, '$["buyer_id"]') AS uuid) AS "buyer_id",
    CAST(json_extract_scalar(after, '$["total_amount"]') AS decimal(18, 2)) AS "total_amount",
    json_extract_scalar(after, '$["status"]') AS "status",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.proc_purchase_order
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.proc_purchase_order_item (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.proc_purchase_order_item COMMENT 'Trạng thái hiện tại của proc.purchase_order_item, dựng từ bronze.proc_purchase_order_item' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["order_id"]') AS uuid) AS "order_id",
    CAST(json_extract_scalar(after, '$["line_no"]') AS integer) AS "line_no",
    CAST(json_extract_scalar(after, '$["item_id"]') AS uuid) AS "item_id",
    json_extract_scalar(after, '$["description"]') AS "description",
    json_extract_scalar(after, '$["uom"]') AS "uom",
    CAST(json_extract_scalar(after, '$["quantity"]') AS decimal(18, 3)) AS "quantity",
    CAST(json_extract_scalar(after, '$["unit_price"]') AS decimal(18, 2)) AS "unit_price",
    CAST(json_extract_scalar(after, '$["lot_id"]') AS uuid) AS "lot_id",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.proc_purchase_order_item
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.proc_purchase_request (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.proc_purchase_request COMMENT 'Trạng thái hiện tại của proc.purchase_request, dựng từ bronze.proc_purchase_request' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["title"]') AS "title",
    CAST(json_extract_scalar(after, '$["requester_id"]') AS uuid) AS "requester_id",
    CAST(json_extract_scalar(after, '$["requester_position_id"]') AS uuid) AS "requester_position_id",
    CAST(json_extract_scalar(after, '$["org_unit_id"]') AS uuid) AS "org_unit_id",
    json_extract_scalar(after, '$["category_code"]') AS "category_code",
    CAST(json_extract_scalar(after, '$["total_amount"]') AS decimal(18, 2)) AS "total_amount",
    json_extract_scalar(after, '$["status"]') AS "status",
    CAST(json_extract_scalar(after, '$["approval_round"]') AS integer) AS "approval_round",
    CAST(json_extract_scalar(after, '$["ic_order_id"]') AS uuid) AS "ic_order_id",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    json_extract_scalar(after, '$["doc_no"]') AS "doc_no",
    json_extract_scalar(after, '$["description"]') AS "description",
    date_add('day', CAST(json_extract_scalar(after, '$["needed_by"]') AS integer), DATE '1970-01-01') AS "needed_by",
    CAST(json_extract_scalar(after, '$["partner_id"]') AS uuid) AS "partner_id",
    json_extract_scalar(after, '$["proposed_partner_name"]') AS "proposed_partner_name",
    json_extract_scalar(after, '$["proposed_partner_tax_code"]') AS "proposed_partner_tax_code",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.proc_purchase_request
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.proc_purchase_request_item (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.proc_purchase_request_item COMMENT 'Trạng thái hiện tại của proc.purchase_request_item, dựng từ bronze.proc_purchase_request_item' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["request_id"]') AS uuid) AS "request_id",
    CAST(json_extract_scalar(after, '$["line_no"]') AS integer) AS "line_no",
    CAST(json_extract_scalar(after, '$["item_id"]') AS uuid) AS "item_id",
    json_extract_scalar(after, '$["description"]') AS "description",
    json_extract_scalar(after, '$["uom"]') AS "uom",
    CAST(json_extract_scalar(after, '$["quantity"]') AS decimal(18, 3)) AS "quantity",
    CAST(json_extract_scalar(after, '$["unit_price"]') AS decimal(18, 2)) AS "unit_price",
    json_extract_scalar(after, '$["note"]') AS "note",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.proc_purchase_request_item
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.wf_approval_history (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.wf_approval_history COMMENT 'Trạng thái hiện tại của wf.approval_history, dựng từ bronze.wf_approval_history' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS bigint) AS "id",
    json_extract_scalar(after, '$["entity_type"]') AS "entity_type",
    CAST(json_extract_scalar(after, '$["entity_id"]') AS uuid) AS "entity_id",
    CAST(json_extract_scalar(after, '$["step_id"]') AS uuid) AS "step_id",
    json_extract_scalar(after, '$["event"]') AS "event",
    CAST(json_extract_scalar(after, '$["person_id"]') AS uuid) AS "person_id",
    CAST(json_extract_scalar(after, '$["on_behalf_of"]') AS uuid) AS "on_behalf_of",
    json_extract_scalar(after, '$["detail"]') AS "detail",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.wf_approval_history
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.wf_approval_rule (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.wf_approval_rule COMMENT 'Trạng thái hiện tại của wf.approval_rule, dựng từ bronze.wf_approval_rule' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["process_code"]') AS "process_code",
    CAST(json_extract_scalar(after, '$["min_amount"]') AS decimal(18, 2)) AS "min_amount",
    CAST(json_extract_scalar(after, '$["max_amount"]') AS decimal(18, 2)) AS "max_amount",
    CAST(json_extract_scalar(after, '$["step_order"]') AS integer) AS "step_order",
    CAST(json_extract_scalar(after, '$["approver_unit_type_id"]') AS uuid) AS "approver_unit_type_id",
    CAST(json_extract_scalar(after, '$["scope_unit_id"]') AS uuid) AS "scope_unit_id",
    json_extract_scalar(after, '$["category_code"]') AS "category_code",
    json_extract_scalar(after, '$["valid_period"]') AS "valid_period",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.wf_approval_rule
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.wf_approval_step (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.wf_approval_step COMMENT 'Trạng thái hiện tại của wf.approval_step, dựng từ bronze.wf_approval_step' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["entity_type"]') AS "entity_type",
    CAST(json_extract_scalar(after, '$["entity_id"]') AS uuid) AS "entity_id",
    CAST(json_extract_scalar(after, '$["round"]') AS integer) AS "round",
    CAST(json_extract_scalar(after, '$["step_order"]') AS integer) AS "step_order",
    CAST(json_extract_scalar(after, '$["rule_id"]') AS uuid) AS "rule_id",
    CAST(json_extract_scalar(after, '$["position_id"]') AS uuid) AS "position_id",
    json_extract_scalar(after, '$["status"]') AS "status",
    CAST(json_extract_scalar(after, '$["acted_by"]') AS uuid) AS "acted_by",
    CAST(json_extract_scalar(after, '$["on_behalf_of"]') AS uuid) AS "on_behalf_of",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["acted_at"]')) AS timestamp(6) with time zone) AS "acted_at",
    json_extract_scalar(after, '$["note"]') AS "note",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.wf_approval_step
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.wf_flow_sync (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.wf_flow_sync COMMENT 'Trạng thái hiện tại của wf.flow_sync, dựng từ bronze.wf_flow_sync' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    json_extract_scalar(after, '$["entity_type"]') AS "entity_type",
    CAST(json_extract_scalar(after, '$["entity_id"]') AS uuid) AS "entity_id",
    CAST(json_extract_scalar(after, '$["round"]') AS integer) AS "round",
    json_extract_scalar(after, '$["process_instance_id"]') AS "process_instance_id",
    CAST(json_extract_scalar(after, '$["dirty"]') AS boolean) AS "dirty",
    CAST(json_extract_scalar(after, '$["finished"]') AS boolean) AS "finished",
    CAST(json_extract_scalar(after, '$["attempts"]') AS integer) AS "attempts",
    json_extract_scalar(after, '$["last_error"]') AS "last_error",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["synced_at"]')) AS timestamp(6) with time zone) AS "synced_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.wf_flow_sync
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.wf_process_model (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.wf_process_model COMMENT 'Trạng thái hiện tại của wf.process_model, dựng từ bronze.wf_process_model' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    json_extract_scalar(after, '$["process_key"]') AS "process_key",
    json_extract_scalar(after, '$["name"]') AS "name",
    json_extract_scalar(after, '$["description"]') AS "description",
    json_extract_scalar(after, '$["bpmn_xml"]') AS "bpmn_xml",
    json_extract_scalar(after, '$["forms"]') AS "forms",
    CAST(json_extract_scalar(after, '$["created_by"]') AS uuid) AS "created_by",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(json_extract_scalar(after, '$["updated_by"]') AS uuid) AS "updated_by",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["updated_at"]')) AS timestamp(6) with time zone) AS "updated_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.wf_process_model
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.wf_process_version (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.wf_process_version COMMENT 'Trạng thái hiện tại của wf.process_version, dựng từ bronze.wf_process_version' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["model_id"]') AS uuid) AS "model_id",
    CAST(json_extract_scalar(after, '$["version"]') AS integer) AS "version",
    json_extract_scalar(after, '$["bpmn_xml"]') AS "bpmn_xml",
    json_extract_scalar(after, '$["forms"]') AS "forms",
    json_extract_scalar(after, '$["sha256"]') AS "sha256",
    json_extract_scalar(after, '$["note"]') AS "note",
    CAST(json_extract_scalar(after, '$["published_by"]') AS uuid) AS "published_by",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["published_at"]')) AS timestamp(6) with time zone) AS "published_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.wf_process_version
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.wf_sandbox_run (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.wf_sandbox_run COMMENT 'Trạng thái hiện tại của wf.sandbox_run, dựng từ bronze.wf_sandbox_run' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["model_id"]') AS uuid) AS "model_id",
    json_extract_scalar(after, '$["xml_sha256"]') AS "xml_sha256",
    json_extract_scalar(after, '$["status"]') AS "status",
    json_extract_scalar(after, '$["steps"]') AS "steps",
    json_extract_scalar(after, '$["variables"]') AS "variables",
    json_extract_scalar(after, '$["error"]') AS "error",
    CAST(json_extract_scalar(after, '$["started_by"]') AS uuid) AS "started_by",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["started_at"]')) AS timestamp(6) with time zone) AS "started_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["finished_at"]')) AS timestamp(6) with time zone) AS "finished_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.wf_sandbox_run
) AS latest
WHERE _rn = 1 AND op <> 'd';

CREATE TABLE IF NOT EXISTS lakehouse.bronze.wf_task (
    "op" varchar,
    "source_ts" timestamp(6) with time zone,
    "source_date" date,
    "lsn" bigint,
    "tx_id" bigint,
    "tenant_id" varchar,
    "record_key" varchar,
    "before" varchar,
    "after" varchar,
    "kafka_partition" integer,
    "kafka_offset" bigint,
    "ingested_at" timestamp(6) with time zone
) WITH (format_version = 2, partitioning = ARRAY['source_date']);
CREATE OR REPLACE VIEW lakehouse.silver.wf_task COMMENT 'Trạng thái hiện tại của wf.task, dựng từ bronze.wf_task' AS
SELECT
    CAST(json_extract_scalar(after, '$["tenant_id"]') AS uuid) AS "tenant_id",
    CAST(json_extract_scalar(after, '$["id"]') AS uuid) AS "id",
    CAST(json_extract_scalar(after, '$["step_id"]') AS uuid) AS "step_id",
    CAST(json_extract_scalar(after, '$["assignee_id"]') AS uuid) AS "assignee_id",
    CAST(json_extract_scalar(after, '$["assigned_position_id"]') AS uuid) AS "assigned_position_id",
    CAST(json_extract_scalar(after, '$["escalated"]') AS boolean) AS "escalated",
    json_extract_scalar(after, '$["escalation_reason"]') AS "escalation_reason",
    json_extract_scalar(after, '$["status"]') AS "status",
    json_extract_scalar(after, '$["flowable_task_id"]') AS "flowable_task_id",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["created_at"]')) AS timestamp(6) with time zone) AS "created_at",
    CAST(from_iso8601_timestamp_nanos(json_extract_scalar(after, '$["closed_at"]')) AS timestamp(6) with time zone) AS "closed_at",
    source_ts AS _changed_at,
    lsn AS _lsn
FROM (
    SELECT *, row_number() OVER (PARTITION BY record_key ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn
    FROM lakehouse.bronze.wf_task
) AS latest
WHERE _rn = 1 AND op <> 'd';
