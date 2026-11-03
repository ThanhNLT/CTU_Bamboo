// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../../utils/cn";
import type { Dataset } from "../types";
import { tr } from "../../../i18n";

const Tag = ({ className, children }: { className: string; children: ReactNode }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-ui px-2 py-0.5 text-[11px] font-medium",
      className,
    )}
  >
    {children}
  </span>
);

const TIER_LABEL = { hot: tr("Nóng"), warm: tr("Ấm"), cold: tr("Lạnh · bất biến") } as const;

export const DatasetTags = ({ dataset }: { dataset: Dataset }) => {
  const failed = dataset.checks.filter((c) => !c.passed).length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {failed > 0 ? (
        <Tag className="bg-amber-50 text-amber-800">
          <span className="h-1.5 w-1.5 rounded-ui bg-amber-500" aria-hidden />
          {failed} {tr(" kiểm tra lỗi")}
        </Tag>
      ) : dataset.certified ? (
        <Tag className="bg-bamboo-50 text-bamboo-700">
          <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          {tr("Đã kiểm định")}
        </Tag>
      ) : null}
      {dataset.pii === "none" && <Tag className="bg-black/[0.045] text-body">{tr("Không PII")}</Tag>}
      {dataset.pii === "masked" && (
        <Tag className="bg-red-50 text-red-700">
          {tr("PII đã che")}
          {dataset.piiNote ? ` · ${dataset.piiNote}` : ""}
        </Tag>
      )}
      {dataset.pii === "raw" && <Tag className="bg-red-100 text-red-800">{tr("Có PII · cần quyền đặc biệt")}</Tag>}
      <Tag className="bg-black/[0.045] text-body">{TIER_LABEL[dataset.tier]}</Tag>
    </div>
  );
};
