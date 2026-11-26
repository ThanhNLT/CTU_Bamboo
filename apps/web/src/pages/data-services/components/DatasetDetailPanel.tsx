/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import { ArrowRight, CheckCircle2, Database, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { cn } from "../../../utils/cn";
import type { Dataset, DatasetPreview, DetailTab } from "../types";
import { useLakehousePreview } from "../useLakehouse";
import { cellText, formatInt } from "../utils";
import { CodeSnippet } from "./CodeSnippet";
import { SchemaTable } from "./SchemaTable";
import { tr } from "../../../i18n";

const TABS: Array<{ key: DetailTab; label: string }> = [
  { key: "schema", label: tr("Lược đồ") },
  { key: "sample", label: tr("Dữ liệu mẫu") },
  { key: "usage", label: tr("Cách dùng") },
  { key: "quality", label: tr("Chất lượng") },
  { key: "lineage", label: tr("Phả hệ") },
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
        {tr("Không tải được dữ liệu mẫu: ")} {error}
      </p>
    );
  if (!preview) return <p className="text-[12.5px] text-muted">{tr("Đang tải dữ liệu mẫu…")}</p>;
  const rows = preview.rows;
  if (rows.length === 0)
    return <p className="text-[12.5px] text-muted">{tr("Tập dữ liệu chưa có dòng nào của công ty này.")}</p>;
  return (
    <div>
      <p className="mb-2.5 text-[12px] text-muted">
        {rows.length} {tr(" dòng thay đổi gần nhất của công ty đang chọn, dữ liệu cá nhân đã che")}
        {preview.masked.length > 0 && <> ({preview.masked.join(", ")})</>}
        {tr(". Không tải xuống dữ liệu thô từ đây.")}
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
    return <p className="text-[12.5px] text-muted">{tr("Chưa có kiểm tra chất lượng tự động cho tập dữ liệu này.")}</p>;
  }
  const failed = dataset.checks.filter((c) => !c.passed).length;
  return (
    <div>
      <p className="mb-2.5 text-[12.5px] text-body">
        <b className="font-semibold text-ink">
          {dataset.checks.length - failed}/{dataset.checks.length}
        </b>{" "}
        {tr("kiểm tra đạt")}
        {failed > 0 && (
          <span className="text-amber-800">
            {" "}
            · {failed} {tr(" lỗi cần xử lý")}
          </span>
        )}
      </p>
      <ul className="m-0 list-none flex flex-col gap-2 p-0">
        {dataset.checks.map((c) => (
          <li
            key={c.name}
            className={cn("flex items-start gap-2.5 rounded-xl px-3 py-2.5", c.passed ? "bg-canvas" : "bg-amber-50")}
          >
            {c.passed ? (
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-bamboo-600" aria-label={tr("Đạt")} />
            ) : (
              <XCircle className="mt-px h-4 w-4 shrink-0 text-amber-600" aria-label={tr("Lỗi")} />
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
    <ul className="m-0 list-none flex flex-col gap-1.5 p-0">
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
      <LineageColumn title={tr("Nguồn")} items={dataset.upstream} />
      <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted md:rotate-0" aria-hidden />
      <div className="rounded-xl border-2 border-bamboo-500 bg-bamboo-50 px-3 py-2 text-center">
        <Database className="mx-auto h-4 w-4 text-bamboo-700" aria-hidden />
        <div className="mt-1 font-mono text-[11.5px] font-semibold text-ink">{dataset.table}</div>
      </div>
      <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted md:rotate-0" aria-hidden />
      <LineageColumn title={tr("Nơi dùng")} items={dataset.downstream} />
    </div>
    <Link
      to={`/d/lineage?asset=${encodeURIComponent(dataset.table)}`}
      className="mt-3 inline-block text-[12.5px] font-semibold text-bamboo-700 underline-offset-2 hover:underline"
    >
      {tr("Mở Phả hệ dữ liệu")}
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
        {tr("Chọn một tập dữ liệu để xem chi tiết.")}
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
        <Meta label={tr("Chủ sở hữu")} value={dataset.owner} />
        <Meta label={tr("Làm mới")} value={dataset.refresh} />
        <Meta label={tr("Số dòng")} value={preview ? formatInt(preview.totalRows) : error ? "—" : tr("Đang đếm…")} />
        <Meta label={tr("Truy cập")} value={dataset.access} />
      </dl>

      <div
        role="tablist"
        aria-label={tr("Nội dung tập dữ liệu")}
        className="mt-5 inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-black/[0.045] p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab}
            onClick={() => setTab(t.key)}
            className={cn(
              "h-7 rounded-full px-3 text-[12px] transition-colors",
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
            <CodeSnippet title={tr("Cách dùng · GraphQL")} code={dataset.graphql} language="graphql" />
          </div>
        )}
        {tab === "sample" && <SampleTable dataset={dataset} preview={preview} error={error} />}
        {tab === "usage" && (
          <div className="flex flex-col gap-5">
            <CodeSnippet title="GraphQL (Hasura)" code={dataset.graphql} language="graphql" />
            <CodeSnippet title="SQL (Trino)" code={dataset.sql} language="sql" />
            <p className="text-[12px] text-muted">
              {tr(
                "Truy vấn chạy bằng quyền của bạn; dữ liệu tự lọc theo công ty (tenant_id). Cần thêm quyền? Bấm “Yêu cầu quyền truy cập”.",
              )}
            </p>
          </div>
        )}
        {tab === "quality" && <QualityList dataset={dataset} />}
        {tab === "lineage" && <Lineage dataset={dataset} />}
      </div>
    </article>
  );
};
