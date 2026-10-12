// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { FileSearch, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { DOC_KIND_LABEL } from "../../../api/documents";
import { smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { formatDate } from "../../../utils/format";
import type { EofficeRecord } from "../types";
import { buildWorkflow } from "../utils";
import { RecordStatusBadge } from "./RecordStatusBadge";
import { VerticalTimeline } from "./VerticalTimeline";

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
);

/** Cột phải: thông tin chứng từ đang chọn — thông tin chung, quy trình duyệt, hành động. */
export const RecordDetailPanel = ({
  record, canReview, onReview, onOpen, onAsk, className,
}: {
  record?: EofficeRecord;
  /** Việc duyệt bước hiện tại đang nằm trong Hộp việc của người dùng. */
  canReview: boolean;
  onReview: (r: EofficeRecord) => void;
  onOpen: (r: EofficeRecord) => void;
  onAsk: (r: EofficeRecord) => void;
  className?: string;
}) => {
  if (!record) {
    return (
      <aside className={cn("flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-white p-6 text-center shadow-card", className)}>
        <FileSearch className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
        <p className="text-[13px] text-muted">Chọn một hồ sơ để xem chi tiết.</p>
      </aside>
    );
  }

  const info: Array<[string, ReactNode]> = [
    ["Loại", DOC_KIND_LABEL[record.type]],
    ["Người lập", record.submitter],
    ["Đơn vị", record.unit],
    ["Số tiền", <span className="tabular-nums">{record.amount}</span>],
    ["Cập nhật", formatDate(record.updatedAt)],
  ];

  return (
    <aside
      aria-label={`Chi tiết ${record.code}`}
      aria-live="polite"
      className={cn("flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-card", className)}
    >
      <header>
        <div className="font-mono text-[11.5px] tracking-tight text-muted">{record.code}</div>
        <h2 className="mt-1 text-[17px] font-semibold leading-snug text-ink">{record.title}</h2>
        <div className="mt-2"><RecordStatusBadge status={record.status} label={record.statusLabel} pill /></div>
      </header>

      <section className="mt-5">
        <SectionTitle>Thông tin</SectionTitle>
        <dl className="m-0 grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px]">
          {info.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="m-0 min-w-0 truncate text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-5">
        <SectionTitle>Quy trình</SectionTitle>
        <VerticalTimeline steps={buildWorkflow(record)} />
      </section>

      <footer className="mt-5 flex flex-wrap gap-2">
        {canReview ? (
          <button type="button" onClick={() => onReview(record)} className={smallPrimaryButtonClass}>Mở để duyệt</button>
        ) : (
          <button type="button" onClick={() => onOpen(record)} className={smallPrimaryButtonClass}>Mở hồ sơ</button>
        )}
        <button type="button" onClick={() => onAsk(record)} className={smallSecondaryButtonClass}>
          <Sparkles className="h-3.5 w-3.5 text-bamboo-600" aria-hidden />
          Hỏi trợ lý
        </button>
      </footer>
    </aside>
  );
};
