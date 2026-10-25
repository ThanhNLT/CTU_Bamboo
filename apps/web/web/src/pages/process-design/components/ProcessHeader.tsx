// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Info } from "lucide-react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import type { Access } from "../types";

type Busy = "save" | "validate" | "sandbox" | "publish";

const BANNER: Record<Access, string> = {
  design:
    "Bản nháp lưu trên máy chủ, mỗi lần lưu ghi nhật ký kiểm toán. Chạy thử deploy bản nháp lên Flowable với khóa sandbox riêng, tự đi qua các tác vụ rồi xóa, không ảnh hưởng quy trình đang chạy. Phát hành chụp bản nháp thành phiên bản bất biến và thông báo cho phòng ban, công ty hoặc cả tập đoàn mà bạn chọn.",
  review:
    "Bạn giám sát quy trình đã phát hành: xem sơ đồ, chạy demo trên đúng phiên bản đang áp dụng (không ảnh hưởng quy trình thật) hoặc yêu cầu người thiết kế sửa chữa. Bạn không sửa được sơ đồ.",
  view: "Sơ đồ luồng công việc đang áp dụng cho đơn vị của bạn. Bấm vào từng bước để xem tên, kéo hoặc cuộn để di chuyển và phóng to.",
};

export const ProcessHeader = ({
  subtitle,
  access,
  dirty,
  busy,
  hasModel,
  deletable,
  onSave,
  onValidate,
  onSandbox,
  onPublish,
  onDownload,
  onEditInfo,
  onDelete,
  onRequestChange,
}: {
  subtitle: string;
  access: Access;
  dirty: boolean;
  busy?: Busy;
  hasModel: boolean;
  deletable: boolean;
  onSave: () => void;
  onValidate: () => void;
  onSandbox: () => void;
  onPublish: () => void;
  onDownload: () => void;
  onEditInfo: () => void;
  onDelete: () => void;
  onRequestChange: () => void;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {access === "design" ? "Thiết kế quy trình" : "Quy trình công việc"}
        </h1>
        <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
      </div>
      {hasModel && (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {access === "design" && (
            <>
              <button
                type="button"
                onClick={onValidate}
                className={secondaryButtonClass}
                disabled={busy === "validate"}
              >
                Kiểm tra
              </button>
              <button type="button" onClick={onDownload} className={secondaryButtonClass}>
                Tải tệp BPMN
              </button>
              <button type="button" onClick={onEditInfo} className={secondaryButtonClass}>
                Thông tin
              </button>
              {deletable && (
                <button type="button" onClick={onDelete} className={secondaryButtonClass}>
                  Xóa nháp
                </button>
              )}
              <button type="button" onClick={onSave} className={secondaryButtonClass} disabled={busy === "save"}>
                {dirty ? "Lưu bản nháp •" : "Lưu bản nháp"}
              </button>
              <button type="button" onClick={onPublish} className={secondaryButtonClass} disabled={busy === "publish"}>
                Phát hành
              </button>
            </>
          )}
          {access === "review" && (
            <button type="button" onClick={onRequestChange} className={secondaryButtonClass}>
              Yêu cầu sửa chữa
            </button>
          )}
          {access !== "view" && (
            <button type="button" onClick={onSandbox} className={primaryButtonClass} disabled={busy === "sandbox"}>
              {busy === "sandbox" ? "Đang chạy…" : access === "design" ? "Chạy thử sandbox" : "Chạy demo"}
            </button>
          )}
        </div>
      )}
    </div>
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-xl border border-line bg-white px-4 py-2.5 text-[12.5px] text-body"
    >
      <Info className="mt-px h-4 w-4 shrink-0 text-bamboo-600" strokeWidth={2} aria-hidden />
      <p className="m-0">{BANNER[access]}</p>
    </div>
  </div>
);
