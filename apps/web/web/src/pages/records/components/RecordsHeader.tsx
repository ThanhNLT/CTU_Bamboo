// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Plus, ScanLine } from "lucide-react";
import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";

export const RecordsHeader = ({
  company, onOcr, onCreate,
}: {
  company: string;
  onOcr: () => void;
  onCreate: () => void;
}) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Hồ sơ</h1>
      <p className="mt-1 text-[13px] text-muted">
        Chứng từ bạn được xem trong {company} · cập nhật trực tiếp
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-2.5">
      <button type="button" onClick={onOcr} className={secondaryButtonClass}>
        <ScanLine className="h-4 w-4 text-body" strokeWidth={1.75} aria-hidden />
        Nhập bằng OCR
      </button>
      <button type="button" onClick={onCreate} className={primaryButtonClass}>
        <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        Tạo hồ sơ
      </button>
    </div>
  </div>
);
