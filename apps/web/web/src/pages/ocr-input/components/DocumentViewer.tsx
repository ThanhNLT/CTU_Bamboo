// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { FileImage, LoaderCircle, Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { FieldKey, OcrField, SourceDoc } from "../types";
import { PAPER_H, PAPER_W } from "../utils";
import { MockDocumentPreview } from "./MockDocumentPreview";

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

const LegendDot = ({ className, label }: { className: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`h-2 w-2 rounded-full ${className}`} aria-hidden />
    {label}
  </span>
);

/** Cột trái: tên tệp, phóng to/thu nhỏ, bản xem trước có khung nhận diện, chú giải màu. */
export const DocumentViewer = ({
  doc,
  fields,
  busy,
  activeKey,
  onPick,
  templateNote,
}: {
  doc: SourceDoc;
  fields: OcrField[];
  /** Đang tải / quét / trích xuất. */
  busy?: string;
  activeKey?: FieldKey;
  onPick: (key: FieldKey) => void;
  templateNote: string;
}) => {
  const [zi, setZi] = useState(1);
  const zoom = ZOOMS[zi] ?? 1;
  const ctl =
    "grid h-7 w-7 place-items-center rounded-full text-ink transition-colors hover:bg-black/[0.06] disabled:opacity-35 " +
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500";

  return (
    <section
      aria-label="Tài liệu gốc"
      className="flex min-w-0 flex-col rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileImage className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="truncate text-[13.5px] font-semibold text-ink">{doc.name}</span>
          <span className="shrink-0 text-[12px] text-muted">
            {doc.sizeLabel} · {doc.pages} trang
          </span>
        </div>
        <div
          className="inline-flex items-center gap-0.5 rounded-full bg-black/[0.045] p-0.5"
          role="group"
          aria-label="Thu phóng"
        >
          <button
            type="button"
            className={ctl}
            onClick={() => setZi((i) => Math.max(0, i - 1))}
            disabled={zi === 0}
            aria-label="Thu nhỏ"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="w-11 text-center text-[12px] tabular-nums text-body" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className={ctl}
            onClick={() => setZi((i) => Math.min(ZOOMS.length - 1, i + 1))}
            disabled={zi === ZOOMS.length - 1}
            aria-label="Phóng to"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="relative mt-4 overflow-auto rounded-xl bg-canvas p-5" style={{ maxHeight: 520 }}>
        {doc.kind === "sample" ? (
          // Bọc theo kích thước đã phóng để thanh cuộn đúng; bên trong phóng bằng transform.
          <div className="mx-auto" style={{ width: PAPER_W * zoom, height: PAPER_H * zoom }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: PAPER_W }}>
              <MockDocumentPreview fields={fields} activeKey={activeKey} onPick={onPick} showBoxes={!busy} />
            </div>
          </div>
        ) : (
          <img
            src={doc.url}
            alt={`Ảnh đã tải lên: ${doc.name}`}
            className="mx-auto block rounded-md bg-white shadow-card"
            style={{ width: `${Math.round(zoom * 75)}%` }}
          />
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-canvas/70 backdrop-blur-[1px]" role="status">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-ink shadow-card">
              <LoaderCircle className="h-4 w-4 text-bamboo-600 motion-safe:animate-spin" aria-hidden />
              {busy}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
        <LegendDot className="bg-bamboo-500" label="≥ 0,8 tin cậy cao" />
        <LegendDot className="bg-yellow-500" label="0,5–0,8 cần xem" />
        <LegendDot className="bg-red-500" label="< 0,5 nhập tay" />
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{templateNote}</p>
    </section>
  );
};
