// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { AlertTriangle } from "lucide-react"; // Lucide React

// ===== Module nội bộ =====
import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { PROCESSES_PATH } from "../mock";
import type { ProcessDef } from "../types";

// ===== Component =====
/** Tiêu đề + Kiểm tra / Tải tệp BPMN / Chạy thử sandbox + thanh cảnh báo bản nháp. */
export const ProcessHeader = ({
  process,
  onValidate,
  onDownload,
  onSandbox,
}: {
  process: ProcessDef;
  onValidate: () => void;
  onDownload: () => void;
  onSandbox: () => void;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Thiết kế quy trình</h1>
        <p className="mt-1 text-[13px] text-muted">
          Thiết kế trực quan quy trình BPMN và biểu mẫu · {process.name} · v{process.version} (bản nháp)
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <button type="button" onClick={onValidate} className={secondaryButtonClass}>
          Kiểm tra
        </button>
        <button type="button" onClick={onDownload} className={secondaryButtonClass}>
          Tải tệp BPMN
        </button>
        <button type="button" onClick={onSandbox} className={primaryButtonClass}>
          Chạy thử sandbox
        </button>
      </div>
    </div>

    <div
      role="note"
      className="flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900"
    >
      <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
      <p>
        <b className="font-semibold">Bản nháp – chưa vào Git.</b> Áp dụng chính thức bằng cách tải tệp và commit vào{" "}
        <code className="rounded bg-amber-100/80 px-1 font-mono text-[11.5px]">{PROCESSES_PATH}</code>; CI sẽ triển
        khai.
      </p>
    </div>
  </div>
);
