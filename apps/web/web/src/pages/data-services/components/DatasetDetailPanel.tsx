// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ArrowRight, CheckCircle2, Database, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { cn } from "../../../utils/cn";
import type { Dataset, DatasetPreview, DetailTab } from "../types";
import { useLakehousePreview } from "../useLakehouse";
import { cellText, formatInt } from "../utils";
import { CodeSnippet } from "./CodeSnippet";
import { SchemaTable } from "./SchemaTable";

const TABS: Array<{ key: DetailTab; label: string }> = [
  { key: "schema", label: "Lược đồ" },
  { key: "sample", label: "Dữ liệu mẫu" },
  { key: "usage", label: "Cách dùng" },
  { key: "quality", label: "Chất lượng" },
  { key: "lineage", label: "Phả hệ" },
];

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-[11.5px] text-muted">{label}</dt>
    <dd className="m-0 mt-0.5 truncate text-[13px] text-ink">{value}</dd>
  </div>
);

const SampleTable = ({ dataset, preview, error }: { dataset: Dataset; preview?: DatasetPreview; error?: string }) => {
  if (error)
    return (
      <p role="alert" className="text-[12.5px] text-red-700">
        Không tải được dữ liệu mẫu: {error}
      </p>
    );
  if (!preview) return <p className="text-[12.5px] text-muted">Đang tải dữ liệu mẫu…</p>;
  const rows = preview.rows;
  if (rows.length === 0)
    return <p className="text-[12.5px] text-muted">Tập dữ liệu chưa có dòng nào của công ty này.</p>;
  return (
    <div>
      <p className="mb-2.5 text-[12px] text-muted">
        {rows.length} dòng thay đổi gần nhất của công ty đang chọn, dữ liệu cá nhân đã che
        {preview.masked.length > 0 && <> ({preview.masked.join(", ")})</>}. Không tải xuống dữ liệu thô từ đây.
      </p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-[12px]">
          <thead className="bg-canvas">
            <tr>
              {dataset.columns.map((c) => (
                <th
                  key={c.name}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 text-left font-mono font-medium text-muted"
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line/70">
                {dataset.columns.map((c) => (
                  <td
                    key={c.name}
                    className="max-w-[320px] truncate whitespace-nowrap px-3 py-2 font-mono tabular-nums text-ink"
                    title={cellText(r[c.name])}
                  >
                    {cellText(r[c.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const QualityList = ({ dataset }: { dataset: Dataset }) => {
  if (dataset.checks.length === 0) {
    return <p className="text-[12.5px] text-muted">Chưa có kiểm tra chất lượng tự động cho tập dữ liệu này.</p>;
  }
  const failed = dataset.checks.filter((c) => !c.passed).length;
  return (
    <div>
      <p className="mb-2.5 text-[12.5px] text-body">
        <b className="font-semibold text-ink">
          {dataset.checks.length - failed}/{dataset.checks.length}
        </b>{" "}
        kiểm tra đạt
        {failed > 0 && <span className="text-amber-800"> · {failed} lỗi cần xử lý</span>}
      </p>
      <ul className="m-0 list-none space-y-2 p-0">
        {dataset.checks.map((c) => (
          <li
            key={c.name}
            className={cn("flex items-start gap-2.5 rounded-xl px-3 py-2.5", c.passed ? "bg-canvas" : "bg-amber-50")}
          >
            {c.passed ? (
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-bamboo-600" aria-label="Đạt" />
            ) : (
              <XCircle className="mt-px h-4 w-4 shrink-0 text-amber-600" aria-label="Lỗi" />
            )}
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ink">{c.name}</span>
              <span className="block text-[11.5px] text-muted">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const LineageColumn = ({ title, items }: { title: string; items: string[] }) => (
  <div className="min-w-0 flex-1">
    <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</div>
    <ul className="m-0 list-none space-y-1.5 p-0">
      {items.map((s) => (
        <li
          key={s}
          className="truncate rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[11.5px] text-ink"
          title={s}
        >
          {s}
        </li>
      ))}
    </ul>
  </div>
);

const Lineage = ({ dataset }: { dataset: Dataset }) => (
  <div>
    <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
      <LineageColumn title="Nguồn" items={dataset.upstream} />
      <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted md:rotate-0" aria-hidden />
      <div className="rounded-xl border-2 border-bamboo-500 bg-bamboo-50 px-3 py-2 text-center">
        <Database className="mx-auto h-4 w-4 text-bamboo-700" aria-hidden />
        <div className="mt-1 font-mono text-[11.5px] font-semibold text-ink">{dataset.table}</div>
      </div>
      <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted md:rotate-0" aria-hidden />
      <LineageColumn title="Nơi dùng" items={dataset.downstream} />
    </div>
    <Link
      to={`/d/lineage?asset=${encodeURIComponent(dataset.table)}`}
      className="mt-3 inline-block text-[12.5px] font-semibold text-bamboo-700 underline-offset-2 hover:underline"
    >
      Mở Phả hệ dữ liệu
    </Link>
  </div>
);

export const DatasetDetailPanel = ({ dataset, className }: { dataset?: Dataset; className?: string }) => {
  const [tab, setTab] = useState<DetailTab>("schema");
  const { preview, error } = useLakehousePreview(dataset?.id);

  if (!dataset) {
    return (
      <div
        className={cn(
          "flex min-h-[280px] items-center justify-center rounded-2xl border border-line bg-surface text-[13px] text-muted shadow-card",
          className,
        )}
      >
        Chọn một tập dữ liệu để xem chi tiết.
      </div>
    );
  }

  return (
    <article
      aria-live="polite"
      className={cn(
        "min-h-0 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6",
        className,
      )}
    >
      <header>
        <div className="font-mono text-[11.5px] text-muted">{dataset.table}</div>
        <h2 className="mt-1 text-[20px] font-semibold leading-snug tracking-[-0.01em] text-ink">{dataset.title}</h2>
      </header>

      <dl className="m-0 mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        <Meta label="Chủ sở hữu" value={dataset.owner} />
        <Meta label="Làm mới" value={dataset.refresh} />
        <Meta label="Số dòng" value={preview ? formatInt(preview.totalRows) : error ? "—" : "Đang đếm…"} />
        <Meta label="Truy cập" value={dataset.access} />
      </dl>

      <div
        role="tablist"
        aria-label="Nội dung tập dữ liệu"
        className="mt-5 inline-flex max-w-full flex-wrap gap-0.5 rounded-ui bg-black/[0.045] p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab}
            onClick={() => setTab(t.key)}
            className={cn(
              "h-7 rounded-ui px-3 text-[12px] transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
              t.key === tab ? "bg-segment font-semibold text-ink shadow-card" : "text-body hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-4">
        {tab === "schema" && (
          <div className="flex flex-col gap-5">
            <SchemaTable columns={dataset.columns} />
            <CodeSnippet title="Cách dùng · GraphQL" code={dataset.graphql} language="graphql" />
          </div>
        )}
        {tab === "sample" && <SampleTable dataset={dataset} preview={preview} error={error} />}
        {tab === "usage" && (
          <div className="flex flex-col gap-5">
            <CodeSnippet title="GraphQL (Hasura)" code={dataset.graphql} language="graphql" />
            <CodeSnippet title="SQL (Trino)" code={dataset.sql} language="sql" />
            <p className="text-[12px] text-muted">
              Truy vấn chạy bằng quyền của bạn; dữ liệu tự lọc theo công ty (tenant_id). Cần thêm quyền? Bấm “Yêu cầu
              quyền truy cập”.
            </p>
          </div>
        )}
        {tab === "quality" && <QualityList dataset={dataset} />}
        {tab === "lineage" && <Lineage dataset={dataset} />}
      </div>
    </article>
  );
};
