// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { FolderPlus, Upload } from "lucide-react";
import { useRef } from "react";
import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";

/** Tiêu đề trang + nút "Thư mục mới" và "Tải lên" (mở hộp chọn tệp). */
export const DriveHeader = ({
  onNewFolder, onUpload,
}: {
  onNewFolder: () => void;
  onUpload: (files: FileList) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Ổ đĩa tài liệu</h1>
        <p className="mt-1 text-[13px] text-muted">
          Lưu trữ nội bộ của tenant · mọi tệp được kiểm dịch (ClamAV) trước khi lưu
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <button type="button" onClick={onNewFolder} className={secondaryButtonClass}>
          <FolderPlus className="h-4 w-4 text-body" strokeWidth={1.75} aria-hidden />
          Thư mục mới
        </button>
        <button type="button" onClick={() => inputRef.current?.click()} className={primaryButtonClass}>
          <Upload className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Tải lên
        </button>
        <input
          ref={inputRef}
          type="file"
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
