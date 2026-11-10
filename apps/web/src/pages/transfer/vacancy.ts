/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import type { Dayjs } from "dayjs";

import { parsePgTimestamp } from "../../utils/format";

export const rangeEnd = (range: string): Dayjs | null => {
  const upper = range
    .slice(range.indexOf(",") + 1, -1)
    .replace(/"/g, "")
    .trim();
  return upper ? parsePgTimestamp(upper) : null;
};

export const isVacantFrom = (assignments: { valid_period: string }[], day: Dayjs): boolean =>
  assignments.every((a) => {
    const end = rangeEnd(a.valid_period);
    return end !== null && !end.isAfter(day);
  });
