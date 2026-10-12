// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { FileSearch, ShieldCheck, ShieldOff, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { EofficeRecord } from "../types";
import { buildWorkflow, currentAssignee, shortHash } from "../utils";
import { RecordStatusBadge } from "./RecordStatusBadge";
import { VerticalTimeline } from "./VerticalTimeline";

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
);

/** Cột phải: thông tin hồ sơ đang chọn — quy trình, phiên bản, niêm phong sổ cái, hành động. */
export const RecordDetailPanel = ({
  record, me, onReview, onOpen, onAsk, className,
}: {
  record?: EofficeRecord;
  me: string;
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

  // Chỉ người đang giữ bước duyệt hiện tại mới "Mở để duyệt"; người khác chỉ xem.
  const canReview = (record.status === "pending_l1" || record.status === "pending_l2") && currentAssignee(record) === me;

  return (
    <aside
      aria-label={`Chi tiết ${record.code}`}
      aria-live="polite"
      className={cn("flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-card", className)}
    >
      <header>
        <div className="font-mono text-[11.5px] tracking-tight text-muted">{record.code}</div>
        <h2 className="mt-1 text-[17px] font-semibold leading-snug text-ink">{record.title}</h2>
        <div className="mt-2"><RecordStatusBadge status={record.status} pill /></div>
      </header>

      <section className="mt-5">
        <SectionTitle>Quy trình</SectionTitle>
        <VerticalTimeline steps={buildWorkflow(record)} />
      </section>

      <section className="mt-5">
        <SectionTitle>Phiên bản</SectionTitle>
        <ul className="m-0 list-none space-y-1.5 p-0">
          {record.versions.map((v) => (
            <li key={v.version} className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 truncate text-body">
                <b className="font-semibold text-ink">v{v.version}</b> · {v.note}
              </span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-muted">{v.at}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-canvas px-3 py-2.5">
        {record.ledgerHash ? (
          <>
            <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-bamboo-600" strokeWidth={1.75} aria-hidden />
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-ink">Đã niêm phong sổ cái</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted" title={record.ledgerHash}>{shortHash(record.ledgerHash)}</div>
            </div>
          </>
        ) : (
          <>
            <ShieldOff className="mt-px h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
            <div className="text-[12px] text-muted">Chưa niêm phong · bản nháp chưa nộp</div>
          </>
        )}
      </div>

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
