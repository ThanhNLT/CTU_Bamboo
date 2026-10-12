// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ExternalLink, TriangleAlert } from "lucide-react";
import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";

export const DataLineageHeader = ({ openMetadataHref, onReport }: { openMetadataHref: string; onReport: () => void }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Phả hệ dữ liệu</h1>
      <p className="mt-1 text-[13px] text-muted">
        Dữ liệu đến từ đâu, đi qua những bước nào và ảnh hưởng tới đâu · OpenMetadata
      </p>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
      <a href={openMetadataHref} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>
        <ExternalLink className="h-4 w-4" aria-hidden />
        Mở trong OpenMetadata
      </a>
      <button type="button" onClick={onReport} className={primaryButtonClass}>
        <TriangleAlert className="h-4 w-4" aria-hidden />
        Báo sự cố dữ liệu
      </button>
    </div>
  </div>
);
