// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App } from "antd";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileIcon,
  ImageIcon,
  Loader2,
  Minus,
  Plus,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { request } from "../../../api/client";
import { cn } from "../../../utils/cn";
import type { Attachment, DocPreview } from "../types";

const ZOOM_STEPS = [50, 75, 100, 125, 150];

const shortHash = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;

/** Thanh chữ giả (skeleton) trên trang xem trước. */
const Line = ({ w }: { w: string }) => <div className={cn("h-2 rounded-full bg-gray-200/80", w)} />;

/** Trang giấy mô phỏng bản PDF. Khi có API, thay bằng ảnh trang do máy chủ dựng (đã qua kiểm dịch). */
const PaperPage = ({ preview, page }: { preview: DocPreview; page: number }) => (
  <div className="flex flex-col gap-3">
    {page === 1 ? (
      <>
        <div className="text-[8.5px] font-medium uppercase tracking-[0.12em] text-muted">{preview.org}</div>
        <div className="text-[15px] font-bold leading-snug text-ink">{preview.heading}</div>
        <div className="text-[10px] text-muted">{preview.subline}</div>
        <div className="my-1 h-px bg-line" />
        <Line w="w-11/12" />
        <Line w="w-10/12" />
        <Line w="w-8/12" />
        <div className="my-1 h-24 rounded-lg border border-line bg-canvas" />
        <Line w="w-full" />
        <Line w="w-7/12" />
      </>
    ) : (
      <>
        <div className="text-[10px] font-semibold text-ink">Trang {page}</div>
        {["w-full", "w-11/12", "w-10/12", "w-full", "w-9/12", "w-11/12", "w-6/12"].map((w, i) => (
          <Line key={i} w={w} />
        ))}
        <div className="my-1 h-16 rounded-lg border border-line bg-canvas" />
        {["w-full", "w-10/12", "w-8/12"].map((w, i) => (
          <Line key={`b${i}`} w={w} />
        ))}
      </>
    )}
  </div>
);

const ImagePreview = ({ name, kind }: { name: string; kind: Attachment["kind"] }) => (
  <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg bg-linear-to-br from-bamboo-50 to-canvas text-muted">
    {kind === "image" ? (
      <ImageIcon className="h-8 w-8" strokeWidth={1.25} aria-hidden />
    ) : (
      <FileIcon className="h-8 w-8" strokeWidth={1.25} aria-hidden />
    )}
    <span className="text-[11px]">{name}</span>
  </div>
);

const toolBtn =
  "grid h-7 w-7 place-items-center rounded-full text-body transition-colors hover:bg-canvas disabled:cursor-default disabled:opacity-40 " +
  "focus-visible:outline-2 focus-visible:outline-bamboo-500";

/** Xin đường dẫn tải có thời hạn (máy chủ kiểm quyền xem và trạng thái kiểm dịch) rồi mở ở tab mới. */
const useDownload = () => {
  const { message } = App.useApp();
  return async (attachmentId: string) => {
    try {
      const { get_download_url } = await request<{ get_download_url: { url: string } }>(
        `query Dl($a: uuid!) { get_download_url(attachment_id: $a) { url } }`,
        { a: attachmentId },
      );
      window.open(get_download_url.url, "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };
};

/**
 * Tệp đính kèm (dạng tab) + kết quả kiểm dịch + vùng xem trước có thanh zoom/trang nổi.
 * Trang đầu dựng từ thông tin chứng từ (máy chủ chưa dựng ảnh trang); nội dung thật mở bằng nút Tải tệp.
 * Chứng từ không có tệp thì chỉ hiện trang đầu.
 */
export const DocumentViewer = ({
  attachments,
  preview,
  className,
}: {
  attachments: Attachment[];
  preview: DocPreview;
  className?: string;
}) => {
  const download = useDownload();
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const file = attachments[active] ?? attachments[0];

  // Đổi việc (đổi bộ tệp) thì quay về tệp đầu, trang 1, 100%.
  useEffect(() => {
    setActive(0);
    setPage(1);
    setZoom(100);
  }, [attachments]);

  const z = ZOOM_STEPS.indexOf(zoom);

  return (
    <section
      aria-label="Tài liệu đính kèm"
      className={cn("flex min-h-0 flex-col rounded-2xl border border-line bg-white p-4 shadow-card", className)}
    >
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tệp đính kèm">
        {attachments.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => {
              setActive(i);
              setPage(1);
            }}
            className={cn(
              "h-7 max-w-full truncate rounded-full px-3 text-[12px] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
              i === active ? "bg-bamboo-100 text-bamboo-800" : "bg-black/[0.045] text-body hover:bg-black/[0.07]",
            )}
          >
            {a.name}
          </button>
        ))}
      </div>

      {attachments.length === 0 && <p className="m-0 text-[12px] text-muted">Chứng từ không có tệp đính kèm.</p>}

      {file && (
        <div className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
          {file.scan === "clean" ? (
            <ShieldCheck className="h-4 w-4 text-bamboo-600" strokeWidth={1.75} aria-hidden />
          ) : file.scan === "pending" ? (
            <Loader2 className="h-4 w-4 animate-spin text-amber-600" strokeWidth={1.75} aria-hidden />
          ) : (
            <ShieldAlert className="h-4 w-4 text-red-600" strokeWidth={1.75} aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">
            {file.scan === "clean" ? "Sạch (ClamAV)" : file.scan === "pending" ? "Đang kiểm dịch" : "Bị chặn · mã độc"}
            {file.sha256 && (
              <>
                {" "}
                · SHA-256{" "}
                <span className="font-mono text-[11px]" title={file.sha256}>
                  {shortHash(file.sha256)}
                </span>
              </>
            )}
          </span>
          {file.scan === "clean" && (
            <button
              type="button"
              onClick={() => void download(file.id)}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-black/[0.045] px-3 text-[12px] font-medium text-ink hover:bg-black/[0.07] focus-visible:outline-2 focus-visible:outline-bamboo-500"
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> Tải tệp
            </button>
          )}
        </div>
      )}

      <div className="relative mt-3 min-h-[420px] flex-1 overflow-hidden rounded-3xl bg-[#eef1ee]">
        <div className="absolute inset-0 overflow-auto px-6 pb-20 pt-6">
          {!file || file.scan === "clean" ? (
            <div
              className="mx-auto rounded-md bg-white p-6 shadow-[0_6px_24px_-6px_rgb(16_24_20/0.18)] transition-[width] duration-200"
              style={{ width: `${(340 * zoom) / 100}px`, maxWidth: zoom <= 100 ? "100%" : undefined }}
            >
              {!file || file.kind === "pdf" ? (
                <PaperPage preview={preview} page={page} />
              ) : (
                <ImagePreview name={file.name} kind={file.kind} />
              )}
            </div>
          ) : file.scan === "pending" ? (
            <div className="flex h-full items-center justify-center text-[13px] text-muted">
              Tệp đang được kiểm dịch, chưa xem được.
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-red-700">
              Tệp bị chặn, không hiển thị nội dung.
            </div>
          )}
        </div>

        {(!file || file.scan === "clean") && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-white px-1.5 py-1 shadow-float">
            <button
              type="button"
              className={toolBtn}
              onClick={() => setZoom(ZOOM_STEPS[z - 1])}
              disabled={z <= 0}
              aria-label="Thu nhỏ"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-11 text-center text-[12px] tabular-nums text-ink">{zoom}%</span>
            <button
              type="button"
              className={toolBtn}
              onClick={() => setZoom(ZOOM_STEPS[z + 1])}
              disabled={z >= ZOOM_STEPS.length - 1}
              aria-label="Phóng to"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="mx-1 h-4 w-px bg-line" aria-hidden />
            <button
              type="button"
              className={toolBtn}
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              aria-label="Trang trước"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="whitespace-nowrap text-[12px] tabular-nums text-ink">
              Trang {page} / {file?.pages ?? 1}
            </span>
            <button
              type="button"
              className={toolBtn}
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= (file?.pages ?? 1)}
              aria-label="Trang sau"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
