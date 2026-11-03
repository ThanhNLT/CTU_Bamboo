// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { BookOpen, Download, FilePlus2, History, RotateCw, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";

import { Dot, smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { CATEGORY_SHORT, SCOPE_LABEL } from "../labels";
import type { LibraryDoc, LibraryFile } from "../types";
import { indexTone, VIEW } from "./indexState";

const size = (b: number) => (b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

const MetaItem = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 truncate text-[12px] text-muted">
    {label}: <span className="text-body">{value}</span>
  </div>
);

const IndexBox = ({ doc, onAsk, onReindex }: { doc: LibraryDoc; onAsk: () => void; onReindex: () => void }) => {
  const { index } = doc;
  const box = {
    indexed: "border-bamboo-100 bg-bamboo-50",
    indexing: "border-amber-100 bg-amber-50",
    missing: "border-amber-100 bg-amber-50",
    error: "border-red-100 bg-red-50",
  }[index.status];
  const text =
    index.status === "indexed"
      ? `Tìm kiếm toàn văn: đã vào chỉ mục${index.at ? ` lúc ${index.at}` : ""} (nội dung tệp, tóm tắt, mục lục)`
      : index.status === "error"
        ? `Tìm kiếm toàn văn: lỗi chỉ mục · ${index.reason}`
        : `Tìm kiếm toàn văn: ${VIEW[index.status].label.toLowerCase()}`;
  return (
    <div
      className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center", box)}
      role="status"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2 text-[12.5px] text-body">
        <Dot tone={indexTone(index)} size="md" className="mt-[5px]" />
        <span className="min-w-0">{text}</span>
      </div>
      {doc.canManage && (
        <button type="button" onClick={onReindex} className={smallSecondaryButtonClass}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          Nạp lại chỉ mục
        </button>
      )}
      <button type="button" onClick={onAsk} className={smallPrimaryButtonClass}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Hỏi về tài liệu này
      </button>
    </div>
  );
};

export const DocumentDetail = ({
  doc,
  onAsk,
  onReindex,
  onDownload,
  onSupersede,
  onRetire,
  className,
}: {
  doc?: LibraryDoc;
  onAsk: (doc: LibraryDoc) => void;
  onReindex: (doc: LibraryDoc) => void;
  onDownload: (file: LibraryFile) => void;
  onSupersede?: (doc: LibraryDoc) => void;
  onRetire: (doc: LibraryDoc) => void;
  className?: string;
}) => {
  const [history, setHistory] = useState(false);
  return (
    <article
      aria-live="polite"
      aria-label="Chi tiết tài liệu"
      className={cn(
        "min-h-0 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6",
        className,
      )}
    >
      {!doc ? (
        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
          <BookOpen className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
          <p className="text-[13px] text-muted">Chọn một tài liệu để xem chi tiết.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <header>
            <span className="inline-flex rounded-ui bg-bamboo-50 px-2.5 py-0.5 text-[11.5px] font-medium text-bamboo-700">
              {CATEGORY_SHORT[doc.category]}
            </span>
            <h2 className="mt-2 text-[20px] font-semibold leading-snug tracking-[-0.01em] text-ink">{doc.title}</h2>
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <MetaItem label="Số tài liệu" value={doc.code} />
              <MetaItem label="Đơn vị ban hành" value={`${doc.unit} · ${doc.issuer}`} />
              <MetaItem label="Hiệu lực" value={doc.effectiveDate ?? doc.publishedAt ?? "—"} />
              <MetaItem
                label="Phiên bản"
                value={`v${doc.version}${doc.previous.length ? ` (${doc.previous.length} bản trước)` : ""}`}
              />
              <MetaItem label="Phạm vi" value={SCOPE_LABEL[doc.scope]} />
              <MetaItem label="Người đề xuất" value={doc.requester} />
            </div>
          </header>

          <IndexBox doc={doc} onAsk={() => onAsk(doc)} onReindex={() => onReindex(doc)} />

          {doc.summary && (
            <section aria-labelledby="kb-summary">
              <h3 id="kb-summary" className="text-[13.5px] font-semibold text-ink">
                Tóm tắt
              </h3>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-body">{doc.summary}</p>
            </section>
          )}

          {doc.toc.length > 0 && (
            <section aria-labelledby="kb-toc">
              <h3 id="kb-toc" className="text-[13.5px] font-semibold text-ink">
                Mục lục
              </h3>
              <ol className="m-0 mt-2 list-decimal space-y-0.5 pl-5 text-[13px] leading-relaxed text-body marker:text-muted">
                {doc.toc.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="kb-files">
            <h3 id="kb-files" className="text-[13.5px] font-semibold text-ink">
              Toàn văn
            </h3>
            {doc.files.length === 0 ? (
              <p className="m-0 mt-2 text-[12.5px] text-muted">Tài liệu chưa có tệp đính kèm.</p>
            ) : (
              <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
                {doc.files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
                    <span className="min-w-0 truncate text-[13px] text-ink">
                      {f.file_name} <span className="text-muted">· {size(f.size_bytes)}</span>
                    </span>
                    <button type="button" onClick={() => onDownload(f)} className={smallSecondaryButtonClass}>
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      Mở toàn văn
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {history && (
            <section aria-label="Phiên bản trước">
              <h3 className="text-[13.5px] font-semibold text-ink">Phiên bản trước</h3>
              {doc.previous.length === 0 ? (
                <p className="m-0 mt-2 text-[12.5px] text-muted">Đây là phiên bản đầu tiên.</p>
              ) : (
                <ul className="m-0 mt-2 list-none space-y-1 p-0 text-[12.5px] text-body">
                  {doc.previous.map((p) => (
                    <li key={p.id}>
                      v{p.version} · <span className="font-mono">{p.doc_no}</span> · ngừng hiệu lực
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <footer className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setHistory((v) => !v)} className={smallSecondaryButtonClass}>
              <History className="h-3.5 w-3.5 text-muted" aria-hidden />
              Lịch sử phiên bản
            </button>
            {onSupersede && (
              <button type="button" onClick={() => onSupersede(doc)} className={smallSecondaryButtonClass}>
                <FilePlus2 className="h-3.5 w-3.5 text-muted" aria-hidden />
                Đề xuất bản thay thế
              </button>
            )}
            {doc.canManage && (
              <button type="button" onClick={() => onRetire(doc)} className={smallSecondaryButtonClass}>
                <XCircle className="h-3.5 w-3.5 text-muted" aria-hidden />
                Ngừng hiệu lực
              </button>
            )}
          </footer>
        </div>
      )}
    </article>
  );
};
