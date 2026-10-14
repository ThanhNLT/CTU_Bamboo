// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Info } from "lucide-react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";

export const ProcessHeader = ({
  subtitle,
  canDesign,
  dirty,
  busy,
  onSave,
  onValidate,
  onSandbox,
  onPublish,
  onDownload,
}: {
  subtitle: string;
  canDesign: boolean;
  dirty: boolean;
  busy?: "save" | "validate" | "sandbox" | "publish";
  onSave: () => void;
  onValidate: () => void;
  onSandbox: () => void;
  onPublish: () => void;
  onDownload: () => void;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Thiết kế quy trình</h1>
        <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <button type="button" onClick={onValidate} className={secondaryButtonClass} disabled={busy === "validate"}>
          Kiểm tra
        </button>
        <button type="button" onClick={onDownload} className={secondaryButtonClass}>
          Tải tệp BPMN
        </button>
        {canDesign && (
          <>
            <button type="button" onClick={onSave} className={secondaryButtonClass} disabled={busy === "save"}>
              {dirty ? "Lưu bản nháp •" : "Lưu bản nháp"}
            </button>
            <button type="button" onClick={onPublish} className={secondaryButtonClass} disabled={busy === "publish"}>
              Phát hành
            </button>
            <button type="button" onClick={onSandbox} className={primaryButtonClass} disabled={busy === "sandbox"}>
              {busy === "sandbox" ? "Đang chạy thử…" : "Chạy thử sandbox"}
            </button>
          </>
        )}
      </div>
    </div>
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-xl border border-line bg-white px-4 py-2.5 text-[12.5px] text-body"
    >
      <Info className="mt-px h-4 w-4 shrink-0 text-bamboo-600" strokeWidth={2} aria-hidden />
      <p className="m-0">
        Bản nháp lưu trên máy chủ, mỗi lần lưu ghi nhật ký kiểm toán. <b>Chạy thử</b> deploy bản nháp lên Flowable với
        khóa sandbox riêng, tự đi qua các tác vụ rồi xóa, không ảnh hưởng quy trình đang chạy. <b>Phát hành</b> chụp bản
        nháp thành phiên bản bất biến (không còn lỗi).
        {!canDesign && " Bạn đang xem: cần quyền wf.process.design để sửa."}
      </p>
    </div>
  </div>
);
