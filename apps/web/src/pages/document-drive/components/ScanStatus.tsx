// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ScanResult } from "../types";
import { tr } from "../../../i18n";

const BLOCKED: Partial<Record<ScanResult, string>> = {
  infected: tr("Bị chặn · mã độc"),
  rejected: tr("Bị loại · sai định dạng"),
};

export const ScanStatus = ({ result }: { result: ScanResult }) =>
  result === "clean" || result === "pending" ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-body">
      <span
        className={result === "clean" ? "h-1.5 w-1.5 rounded-ui bg-bamboo-500" : "h-1.5 w-1.5 rounded-ui bg-amber-500"}
        aria-hidden
      />
      {result === "clean" ? tr("Đã quét · sạch") : tr("Đang kiểm tra")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-ui bg-red-50 px-2 py-0.5 text-[11.5px] font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-ui bg-red-500" aria-hidden />
      {BLOCKED[result]}
    </span>
  );
