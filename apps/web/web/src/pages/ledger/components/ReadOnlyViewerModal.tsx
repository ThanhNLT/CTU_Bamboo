// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Modal } from "antd";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useState } from "react";
import { READING_ROOM_RULES } from "../mock";
import type { ArchiveDoc } from "../types";

const escXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);

/** Dấu chìm lặp lại: tên người xem + thời điểm, xoay chéo, phủ toàn trang. */
const watermarkUrl = (text: string) => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='190'>` +
    `<text x='170' y='100' text-anchor='middle' transform='rotate(-24 170 95)' fill='rgba(27,35,30,0.11)' ` +
    `font-size='13' font-family='Inter, Segoe UI, Arial, sans-serif'>${escXml(text)}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
};

/** Độ dài dòng giả lập (cố định theo trang) để trang trông như văn bản thật. */
const lineWidths = (page: number) => Array.from({ length: 14 }, (_, i) => 62 + ((page * 17 + i * 29) % 38));

const PageBody = ({ doc, page }: { doc: ArchiveDoc; page: number }) =>
  page === 1 ? (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted">{doc.unit}</div>
      <h3 className="mt-6 max-w-[80%] text-[19px] font-semibold leading-snug text-ink">{doc.title}</h3>
      <div className="mt-3 font-mono text-[12px] text-muted">{doc.code}</div>
      <div className="mt-10 text-[12px] text-body">
        Lưu trữ năm {doc.archivedYear} · {doc.pages} trang · {doc.access}
      </div>
    </div>
  ) : (
    <div>
      <div className="mb-4 h-3 w-1/2 rounded bg-ink/15" aria-hidden />
      <div className="space-y-2.5" aria-hidden>
        {lineWidths(page).map((w, i) => (
          <div
            key={i}
            className="h-2 rounded bg-ink/[0.08]"
            style={{ width: `${w}%`, marginTop: i % 5 === 4 ? 14 : undefined }}
          />
        ))}
      </div>
      <p className="sr-only">
        Nội dung trang {page} của {doc.title}.
      </p>
    </div>
  );

/**
 * Trình xem chỉ đọc: không có nút tải, chặn chuột phải / sao chép / kéo, phủ dấu chìm tên người xem.
 * (Bảo vệ ở giao diện chỉ là lớp ngoài; máy chủ chỉ trả ảnh trang đã đóng dấu, không trả tệp gốc.)
 */
export const ReadOnlyViewerModal = ({
  doc,
  viewer,
  openedAt,
  onClose,
}: {
  doc?: ArchiveDoc;
  viewer: string;
  openedAt: string;
  onClose: () => void;
}) => {
  const [page, setPage] = useState(1);
  const total = doc?.pages ?? 1;
  const go = (p: number) => setPage(Math.min(total, Math.max(1, p)));

  return (
    <Modal
      open={doc != null}
      onCancel={onClose}
      footer={null}
      width={760}
      afterOpenChange={(open) => !open && setPage(1)}
      title={
        <span className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted" aria-hidden />
          <span className="truncate">{doc?.title}</span>
          <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-line px-2 text-[11px] font-medium text-body">
            Chỉ đọc
          </span>
        </span>
      }
    >
      {doc && (
        <div>
          <div
            className="relative select-none overflow-hidden rounded-xl bg-canvas p-4 sm:p-6"
            onContextMenu={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          >
            <article className="mx-auto min-h-[480px] max-w-[460px] rounded-md bg-white px-8 py-10 shadow-card">
              <PageBody doc={doc} page={page} />
            </article>
            <div
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: watermarkUrl(`${viewer} · ${openedAt} · CHỈ ĐỌC`) }}
              aria-hidden
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11.5px] text-muted">{READING_ROOM_RULES}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => go(page - 1)}
                disabled={page <= 1}
                aria-label="Trang trước"
                className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-ink hover:bg-canvas disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <span className="min-w-[84px] text-center text-[12.5px] tabular-nums text-body" aria-live="polite">
                Trang {page}/{total}
              </span>
              <button
                type="button"
                onClick={() => go(page + 1)}
                disabled={page >= total}
                aria-label="Trang sau"
                className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-ink hover:bg-canvas disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
