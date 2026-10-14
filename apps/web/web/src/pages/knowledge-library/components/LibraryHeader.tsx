// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Sparkles } from "lucide-react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";

export const LibraryHeader = ({
  canPropose,
  onSuggest,
  onAskLibrary,
}: {
  canPropose: boolean;
  onSuggest: () => void;
  onAskLibrary: () => void;
}) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Thư viện tri thức</h1>
      <p className="mt-1 text-[13px] text-muted">
        Quy chế, quy trình chuẩn, hướng dẫn · đây cũng là nguồn tri thức của Trợ lý đa năng
      </p>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
      {canPropose && (
        <button type="button" onClick={onSuggest} className={secondaryButtonClass}>
          Đề xuất tài liệu
        </button>
      )}
      <button type="button" onClick={onAskLibrary} className={primaryButtonClass}>
        <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
        Hỏi trợ lý về thư viện
      </button>
    </div>
  </div>
);
