// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

import { request } from "../../api/client";
import type { Dataset, DatasetPreview } from "./types";

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

const COLUMN_NOTE: Record<string, string> = {
  id: "Khóa chính",
  tenant_id: "Công ty (tenant) · tự lọc theo tenant đang chọn",
  _changed_at: "Thời điểm thay đổi gần nhất (theo CDC)",
  _lsn: "Vị trí WAL của thay đổi gần nhất",
  created_at: "Thời điểm tạo",
  updated_at: "Thời điểm sửa gần nhất",
  status: "Trạng thái",
  doc_no: "Số chứng từ",
  title: "Tiêu đề",
  total_amount: "Tổng tiền (VND)",
  org_unit_id: "Đơn vị",
  valid_period: "Thời gian hiệu lực",
};

const PII_COLUMN = /(^|_)(email|phone|date_of_birth)$|_enc$/;

const usage = (name: string) => ({
  graphql: `query {\n  lakehouse_preview(dataset: "${name}") {\n    total_rows\n    rows\n    masked\n  }\n}`,
  sql: `-- Trino, người dùng của tenant: row filter tự thêm tenant_id = <tenant của bạn>\nSELECT *\nFROM lakehouse.silver.${name}\nORDER BY _changed_at DESC\nLIMIT 100;`,
});

const toDataset = (d: RawDataset): Dataset => {
  const [schema, ...rest] = d.name.split("_");
  const source = `${schema}.${rest.join("_")}`;
  return {
    id: d.name,
    table: `lakehouse.silver.${d.name}`,
    title: d.label,
    description: `Trạng thái hiện tại của bảng ${source}: mỗi bản ghi một dòng, dựng từ lịch sử thay đổi (CDC) ở tầng bronze.`,
    domain: d.domain,
    owner: "Nền tảng dữ liệu",
    refresh: "Gần thời gian thực (CDC)",
    access: "Trino · view silver",
    updatedLabel: "Gần thời gian thực",
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
    downstream: ["Dịch vụ dữ liệu (trang này)"],
    ...usage(d.name),
  };
};

type Status = { statusCode?: number; message: string };

export const useLakehouseDatasets = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Status>();

  useEffect(() => {
    let alive = true;
    request<{ lakehouse_datasets: RawDataset[] }>(DATASETS)
      .then((r) => alive && setDatasets(r.lakehouse_datasets.map(toDataset)))
      .catch((e: Status) => alive && setError({ statusCode: e.statusCode, message: e.message }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { datasets, loading, error };
};

export const useLakehousePreview = (name?: string) => {
  const [preview, setPreview] = useState<DatasetPreview>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!name) return;
    let alive = true;
    setPreview(undefined);
    setError(undefined);
    request<{ lakehouse_preview: { total_rows: number; rows: Array<Record<string, unknown>>; masked: string[] } }>(
      PREVIEW,
      { dataset: name },
    )
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
