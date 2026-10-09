// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ScanResult } from "../types";

/** Kết quả kiểm dịch: "Sạch" (chấm xanh) hoặc "Bị chặn · mã độc" (nhãn đỏ nhạt). */
export const ScanStatus = ({ result }: { result: ScanResult }) =>
  result === "clean" ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-body">
      <span className="h-1.5 w-1.5 rounded-full bg-bamboo-500" aria-hidden />
      Sạch
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11.5px] font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
      Bị chặn · mã độc
    </span>
  );
