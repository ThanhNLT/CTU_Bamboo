/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useState } from "react";

import { request } from "../../api/client";
import type { Dataset, DatasetPreview } from "./types";
import { tr, trf } from "../../i18n";

const DATASETS = `
  query LakehouseDatasets {
    lakehouse_datasets { name label domain columns { name type } }
  }
`;

const PREVIEW = `
  query LakehousePreview($dataset: String!) {
    lakehouse_preview(dataset: $dataset) { total_rows rows masked }
  }
`;

type RawDataset = { name: string; label: string; domain: string; columns: Array<{ name: string; type: string }> };
type RawPreview = { total_rows: number; rows: Array<Record<string, unknown>>; masked: string[] };

const COLUMN_NOTE: Record<string, string> = {
  id: tr("Khóa chính"),
  tenant_id: tr("Công ty (tenant) · tự lọc theo tenant đang chọn"),
  _changed_at: tr("Thời điểm thay đổi gần nhất (theo CDC)"),
  _lsn: tr("Vị trí WAL của thay đổi gần nhất"),
  created_at: tr("Thời điểm tạo"),
  updated_at: tr("Thời điểm sửa gần nhất"),
  status: tr("Trạng thái"),
  doc_no: tr("Số chứng từ"),
  title: tr("Tiêu đề"),
  total_amount: tr("Tổng tiền (VND)"),
  org_unit_id: tr("Đơn vị"),
  valid_period: tr("Thời gian hiệu lực"),
};

const PII_COLUMN = /(^|_)(email|phone|date_of_birth)$|_enc$/;

const usage = (name: string) => ({
  graphql: `query {\n  lakehouse_preview(dataset: "${name}") {\n    total_rows\n    rows\n    masked\n  }\n}`,
  sql: trf(
    "-- Trino, người dùng của tenant: row filter tự thêm tenant_id = <tenant của bạn>\nSELECT *\nFROM lakehouse.silver.{0}\nORDER BY _changed_at DESC\nLIMIT 100;",
    [name],
  ),
});

const toDataset = (d: RawDataset): Dataset => {
  const [schema, ...rest] = d.name.split("_");
  const source = `${schema}.${rest.join("_")}`;
  return {
    id: d.name,
    table: `lakehouse.silver.${d.name}`,
    title: d.label,
    description: trf(
      "Trạng thái hiện tại của bảng {0}: mỗi bản ghi một dòng, dựng từ lịch sử thay đổi (CDC) ở tầng bronze.",
      [source],
    ),
    domain: d.domain,
    owner: tr("Nền tảng dữ liệu"),
    refresh: tr("Gần thời gian thực (CDC)"),
    access: "Trino · view silver",
    updatedLabel: tr("Gần thời gian thực"),
    certified: false,
    pii: "masked",
    tier: "hot",
    columns: d.columns.map((c) => ({
      name: c.name,
      type: c.type,
      description: COLUMN_NOTE[c.name] ?? "",
      pii: PII_COLUMN.test(c.name),
    })),
    checks: [],
    upstream: [`PostgreSQL · bms.${source}`, `Kafka · bms.${source}`, `Iceberg · lakehouse.bronze.${d.name}`],
    downstream: [tr("Dịch vụ dữ liệu (trang này)")],
    ...usage(d.name),
  };
};

type Status = { statusCode?: number; message: string; errors?: { code?: string } };

// Trino nằm sau sleeper: lần gọi đầu sau khi nhàn rỗi phải chờ Trino khởi động và có thể quá thời gian chờ của action.
// Gọi lại vài lần thay vì báo lỗi ngay; lỗi quyền, không tìm thấy, sai tham số là kết quả thật nên không gọi lại.
const WAKE_RETRIES = 4;
const WAKE_RETRY_MS = 5000;
const FINAL_CODES = new Set(["unauthorized", "forbidden", "not-found", "bad-request"]);
const FINAL_STATUS = new Set([401, 403, 404]);

const isFinal = (e: Status) =>
  FINAL_STATUS.has(e.statusCode ?? 0) || (!!e.errors?.code && FINAL_CODES.has(e.errors.code));

async function waking<T>(call: () => Promise<T>, live: () => boolean, onRetry: () => void): Promise<T> {
  for (let left = WAKE_RETRIES; ; left--) {
    try {
      return await call();
    } catch (e) {
      if (left <= 0 || !live() || isFinal(e as Status)) throw e;
      onRetry();
      await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_MS));
      if (!live()) throw e;
    }
  }
}

export const useLakehouseDatasets = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<Status>();

  useEffect(() => {
    let alive = true;
    const load = () => request<{ lakehouse_datasets: RawDataset[] }>(DATASETS);
    waking(load, () => alive, () => setStarting(true))
      .then((r) => alive && setDatasets(r.lakehouse_datasets.map(toDataset)))
      .catch((e: Status) => alive && setError({ statusCode: e.statusCode, message: e.message }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { datasets, loading, starting, error };
};

export const useLakehousePreview = (name?: string) => {
  const [preview, setPreview] = useState<DatasetPreview>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!name) return;
    let alive = true;
    setPreview(undefined);
    setError(undefined);
    const load = () => request<{ lakehouse_preview: RawPreview }>(PREVIEW, { dataset: name });
    waking(load, () => alive, () => undefined)
      .then(
        ({ lakehouse_preview: p }) => alive && setPreview({ totalRows: p.total_rows, rows: p.rows, masked: p.masked }),
      )
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [name]);

  return { preview, loading: !!name && !preview && !error, error };
};
