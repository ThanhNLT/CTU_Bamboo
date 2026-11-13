/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
