// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { BookOpen, History, RotateCw, Sparkles } from "lucide-react";
import { Dot, smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { CATEGORY_SHORT } from "../mock";
import type { LibraryDoc } from "../types";
import { indexTone } from "./indexState";

const MetaItem = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 truncate text-[12px] text-muted">
    {label}: <span className="text-body">{value}</span>
  </div>
);

/** Khối trạng thái nạp vào Trợ lý, kèm hành động phù hợp từng trạng thái. */
const AssistantBox = ({ doc, onAsk, onReindex }: { doc: LibraryDoc; onAsk: () => void; onReindex: () => void }) => {
  const { index } = doc;
  const box = {
    indexed: "border-bamboo-100 bg-bamboo-50",
    indexing: "border-amber-100 bg-amber-50",
    failed: "border-red-100 bg-red-50",
  }[index.status];

  const text =
    index.status === "indexed"
      ? `Đã nạp vào trợ lý · ${index.chunks} đoạn · ${index.at}`
      : index.status === "indexing"
        ? `Đang nạp vào trợ lý · ${index.progress}%`
        : `Lỗi nạp · ${index.reason}`;

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center", box)} role="status">
      <div className="flex min-w-0 flex-1 items-start gap-2 text-[12.5px] text-body">
        <Dot tone={indexTone(index)} size="md" className="mt-[5px]" />
        <span className="min-w-0">{text}</span>
      </div>
      {index.status === "failed" ? (
        <button type="button" onClick={onReindex} className={smallSecondaryButtonClass}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          Nạp lại
        </button>
      ) : (
        <button
          type="button"
          onClick={onAsk}
          disabled={index.status !== "indexed"}
          title={index.status !== "indexed" ? "Chờ nạp xong để hỏi trợ lý" : undefined}
          className={smallPrimaryButtonClass}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Hỏi về tài liệu này
        </button>
      )}
    </div>
  );
};

/** Cột phải: thông tin, trạng thái nạp, mục lục và trích đoạn của tài liệu đang chọn. */
export const DocumentDetail = ({
  doc, onAsk, onReindex, onHistory, onOpenFull, className,
}: {
  doc?: LibraryDoc;
  onAsk: (doc: LibraryDoc) => void;
  onReindex: (doc: LibraryDoc) => void;
  onHistory: (doc: LibraryDoc) => void;
  onOpenFull: (doc: LibraryDoc) => void;
  className?: string;
}) => (
  <article
    aria-live="polite"
    className={cn("min-h-0 overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6", className)}
  >
    {!doc ? (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
        <BookOpen className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
        <p className="text-[13px] text-muted">Chọn một tài liệu để xem chi tiết.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-5">
        <header>
          <span className="inline-flex rounded-full bg-bamboo-50 px-2.5 py-0.5 text-[11.5px] font-medium text-bamboo-700">
            {CATEGORY_SHORT[doc.category]}
          </span>
          <h2 className="mt-2 text-[20px] font-semibold leading-snug tracking-[-0.01em] text-ink">{doc.title}</h2>
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <MetaItem label="Chủ sở hữu" value={doc.owner} />
            <MetaItem label="Hiệu lực" value={doc.effectiveDate} />
            <MetaItem label="Phiên bản" value={doc.versionLabel} />
            <MetaItem label={`${doc.pages} trang`} value={doc.format} />
          </div>
        </header>

        <AssistantBox doc={doc} onAsk={() => onAsk(doc)} onReindex={() => onReindex(doc)} />

        <section aria-labelledby="kb-toc">
          <h3 id="kb-toc" className="text-[13.5px] font-semibold text-ink">Mục lục</h3>
          <ol className="m-0 mt-2 list-decimal space-y-0.5 pl-5 text-[13px] leading-relaxed text-body marker:text-muted">
            {doc.toc.map((t) => <li key={t}>{t}</li>)}
          </ol>
        </section>

        {doc.excerpt && (
          <section aria-labelledby="kb-excerpt">
            <h3 id="kb-excerpt" className="text-[13.5px] font-semibold text-ink">{doc.excerpt.heading}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-body">{doc.excerpt.body}</p>
          </section>
        )}

        <footer className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onHistory(doc)} className={smallSecondaryButtonClass}>
            <History className="h-3.5 w-3.5 text-muted" aria-hidden />
            Lịch sử phiên bản
          </button>
          <button type="button" onClick={() => onOpenFull(doc)} className={smallSecondaryButtonClass}>
            <BookOpen className="h-3.5 w-3.5 text-muted" aria-hidden />
            Mở toàn văn
          </button>
        </footer>
      </div>
    )}
  </article>
);
