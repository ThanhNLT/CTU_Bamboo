// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ScanResult } from "../types";

const BLOCKED: Partial<Record<ScanResult, string>> = {
  infected: "Bị chặn · mã độc",
  rejected: "Bị loại · sai định dạng",
};

/** Kết quả kiểm dịch: "Sạch" (chấm xanh), "Đang kiểm tra" (chấm vàng) hoặc nhãn đỏ nhạt khi bị chặn/loại. */
export const ScanStatus = ({ result }: { result: ScanResult }) =>
  result === "clean" || result === "pending" ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-body">
      <span
        className={
          result === "clean" ? "h-1.5 w-1.5 rounded-full bg-bamboo-500" : "h-1.5 w-1.5 rounded-full bg-amber-500"
        }
        aria-hidden
      />
      {result === "clean" ? "Sạch" : "Đang kiểm tra"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11.5px] font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
      {BLOCKED[result]}
    </span>
  );
