// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { Dayjs } from "dayjs";

import { parsePgTimestamp } from "../../utils/format";

// Đầu mút trên của khoảng hiệu lực kiểu tstzrange ('["2025-01-01 00:00:00+07",)'); null nếu không giới hạn
export const rangeEnd = (range: string): Dayjs | null => {
  const upper = range
    .slice(range.indexOf(",") + 1, -1)
    .replace(/"/g, "")
    .trim();
  return upper ? parsePgTimestamp(upper) : null;
};

// Ghế trống từ ngày đó khi mọi bổ nhiệm của ghế đều đã kết thúc trước hoặc vào ngày đó
export const isVacantFrom = (assignments: { valid_period: string }[], day: Dayjs): boolean =>
  assignments.every((a) => {
    const end = rangeEnd(a.valid_period);
    return end !== null && !end.isAfter(day);
  });
