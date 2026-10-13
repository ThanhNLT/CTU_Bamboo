// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Tooltip } from "antd"; // Ant Design
import { Upload } from "lucide-react"; // Lucide React
import { useRef } from "react"; // React

// ===== Module nội bộ =====
import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";

// ===== Component =====
/** Tiêu đề trang + nút "Tải lên" (mở hộp chọn tệp). Tệp luôn thuộc một chứng từ: chỉ tải được khi đang mở thư mục. */
export const DriveHeader = ({
  onUpload,
  uploadDisabledReason,
}: {
  onUpload: (files: FileList) => void;
  uploadDisabledReason?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Ổ đĩa tài liệu</h1>
        <p className="mt-1 text-[13px] text-muted">
          Tệp đính kèm của các chứng từ bạn được xem · mọi tệp được kiểm dịch (ClamAV) trước khi lưu
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Tooltip title={uploadDisabledReason}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(uploadDisabledReason)}
            className={
              uploadDisabledReason ? `${secondaryButtonClass} cursor-not-allowed opacity-60` : primaryButtonClass
            }
          >
            <Upload className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Tải lên
          </button>
        </Tooltip>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onUpload(e.target.files);
            e.target.value = ""; // cho phép chọn lại cùng tệp
          }}
        />
      </div>
    </div>
  );
};
