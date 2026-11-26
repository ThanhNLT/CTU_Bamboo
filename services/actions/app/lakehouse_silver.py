# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import argparse
import json
import pathlib

import psycopg

from . import config

OUT = pathlib.Path(__file__).resolve().parents[3] / "infra/platform/trino/silver.sql"
RULES_OUT = OUT.with_name("rules.json")
CATALOG = "lakehouse"
ADMIN_USER = "bms-admin"
ACTIONS_USER = "bms-actions"
TENANT_USER = "t_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
TENANT_OF_USER = "CAST(substr(current_user, 3) AS uuid)"
CDC_EXCLUDED_COLUMNS = {
    ("core", "attachment_ocr"): {"page_texts"},
    ("collab", "notification_pref"): {"address"},
    ("wf", "process_automation"): {"webhook_sha256"},
    ("core", "external_module"): {"key_salt", "key_sha256"},
    ("core", "person"): {"birth_year", "phone", "email"},
}

_COLUMNS = """
SELECT pt.schemaname, pt.tablename, a.attname, t.typname, t.typcategory, a.atttypmod,
       format_type(a.atttypid, a.atttypmod) AS pg_type, et.typname AS elem_type,
       a.attnum = ANY (i.indkey) AS is_key
FROM pg_publication_tables pt
JOIN pg_namespace n ON n.nspname = pt.schemaname
JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = pt.tablename
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
JOIN pg_type t ON t.oid = a.atttypid
LEFT JOIN pg_type et ON et.oid = t.typelem AND t.typcategory = 'A'
LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
WHERE pt.pubname = 'bms_cdc' AND pt.schemaname <> 'cdc'
ORDER BY pt.schemaname, pt.tablename, a.attnum
"""


def bronze_ddl() -> list[tuple[str, str]]:
    from .lakehouse_sink import BRONZE_COLUMNS

    return BRONZE_COLUMNS


def _path(name: str) -> str:
    return "'$[\"" + name.replace("'", "''") + "\"]'"


def column_expr(name: str, typname: str, category: str, typmod: int, elem: str | None) -> tuple[str, str]:
    scalar = f"json_extract_scalar(after, {_path(name)})"
    if typname == "uuid":
        return f"CAST({scalar} AS uuid)", "uuid"
    if typname in ("int2", "int4", "int8"):
        trino = {"int2": "smallint", "int4": "integer", "int8": "bigint"}[typname]
        return f"CAST({scalar} AS {trino})", trino
    if typname in ("float4", "float8"):
        trino = "real" if typname == "float4" else "double"
        return f"CAST({scalar} AS {trino})", trino
    if typname == "numeric":
        if typmod >= 4:
            precision, scale = ((typmod - 4) >> 16) & 0xFFFF, (typmod - 4) & 0xFFFF
            return f"CAST({scalar} AS decimal({precision}, {scale}))", f"decimal({precision}, {scale})"
        return f"CAST({scalar} AS double)", "double"
    if typname == "bool":
        return f"CAST({scalar} AS boolean)", "boolean"
    if typname == "date":
        return f"date_add('day', CAST({scalar} AS integer), DATE '1970-01-01')", "date"
    if typname == "timestamptz":
        return (
            f"CAST(from_iso8601_timestamp_nanos({scalar}) AS timestamp(6) with time zone)",
            "timestamp(6) with time zone",
        )
    if category == "A":
        return f"CAST(json_extract(after, {_path(name)}) AS array(varchar))", "array(varchar)"
    return scalar, "varchar"


def _ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _tables(conn: psycopg.Connection) -> dict[tuple[str, str], list[tuple]]:
    tables: dict[tuple[str, str], list[tuple]] = {}
    for row in conn.execute(_COLUMNS).fetchall():
        if row[2] in CDC_EXCLUDED_COLUMNS.get((row[0], row[1]), ()):
            continue
        tables.setdefault((row[0], row[1]), []).append(row[2:])
    return tables


def tenant_column(schema: str, table: str, columns: set[str]) -> str | None:
    if "tenant_id" in columns:
        return "tenant_id"
    return "id" if (schema, table) == ("core", "tenant") else None


def build_rules(conn: psycopg.Connection) -> str:
    tenant_tables = []
    for (schema, table), cols in _tables(conn).items():
        column = tenant_column(schema, table, {c[0] for c in cols})
        if column:
            tenant_tables.append(
                {
                    "user": TENANT_USER,
                    "catalog": CATALOG,
                    "schema": "silver",
                    "table": f"{schema}_{table}",
                    "privileges": ["SELECT"],
                    "filter": f"{_ident(column)} = {TENANT_OF_USER}",
                }
            )
    rules = {
        "impersonation": [{"original_user": ACTIONS_USER, "new_user": TENANT_USER}],
        "catalogs": [
            {"user": ADMIN_USER, "allow": "all"},
            {"user": TENANT_USER, "catalog": CATALOG, "allow": "read-only"},
        ],
        "schemas": [
            {"user": ADMIN_USER, "owner": True},
            {"user": TENANT_USER, "catalog": CATALOG, "schema": "silver", "owner": False},
        ],
        "tables": [
            {"user": ADMIN_USER, "privileges": ["SELECT", "INSERT", "DELETE", "UPDATE", "OWNERSHIP", "GRANT_SELECT"]},
            *tenant_tables,
        ],
    }
    return json.dumps(rules, ensure_ascii=False, indent=2) + "\n"


def build(conn: psycopg.Connection) -> str:
    tables = _tables(conn)
    bronze_cols = ",\n    ".join(f"{_ident(n)} {t}" for n, t in bronze_ddl())
    out = [
        "-- Bamboo - DX-OS Open-Core",
        "-- @version 0.5.2",
        "-- @author CTUBamboo",
        "-- @copyright Copyright 2026 Bamboo",
        "-- @license Apache-2.0",
        "-- @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project",
        "--",
        '-- Licensed under the Apache License, Version 2.0 (the "License");',
        "-- you may not use this file except in compliance with the License.",
        "-- You may obtain a copy of the License at",
        "--",
        "--     http://www.apache.org/licenses/LICENSE-2.0",
        "--",
        "-- Unless required by applicable law or agreed to in writing, software",
        '-- distributed under the License is distributed on an "AS IS" BASIS,',
        "-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.",
        "-- See the License for the specific language governing permissions and",
        "-- limitations under the License.",
        "",
        f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.bronze;",
        f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.silver;",
    ]
    for (schema, table), cols in tables.items():
        name = f"{schema}_{table}"
        exprs = []
        for attname, typname, category, typmod, _pg_type, elem, _is_key in cols:
            expr, _trino = column_expr(attname, typname, category, typmod, elem)
            exprs.append(f"{expr} AS {_ident(attname)}")
        out += [
            "",
            f"CREATE TABLE IF NOT EXISTS {CATALOG}.bronze.{name} (\n    {bronze_cols}\n)"
            " WITH (format_version = 2, partitioning = ARRAY['source_date']);",
            f"CREATE OR REPLACE VIEW {CATALOG}.silver.{name}"
            f" COMMENT 'Trạng thái hiện tại của {schema}.{table}, dựng từ bronze.{name}' AS\nSELECT\n    "
            + ",\n    ".join(exprs + ["source_ts AS _changed_at", "lsn AS _lsn"])
            + f"\nFROM (\n    SELECT *, row_number() OVER (PARTITION BY record_key"
            f" ORDER BY kafka_partition DESC, kafka_offset DESC) AS _rn\n"
            f"    FROM {CATALOG}.bronze.{name}\n) AS latest\nWHERE _rn = 1 AND op <> 'd';",
        ]
    return "\n".join(out) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(OUT))
    parser.add_argument("--rules-out", default=str(RULES_OUT))
    args = parser.parse_args()
    with psycopg.connect(config.load().database_url) as conn:
        sql, rules = build(conn), build_rules(conn)
    for path, text in ((args.out, sql), (args.rules_out, rules)):
        pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(path).write_text(text, encoding="utf-8")
    print(
        f"đã ghi {args.out}: {sql.count('CREATE OR REPLACE VIEW')} view silver; "
        f"{args.rules_out}: {rules.count(chr(34) + 'filter' + chr(34))} view theo tenant"
    )


if __name__ == "__main__":
    main()
