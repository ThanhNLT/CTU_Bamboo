/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11.5px] font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-ui bg-red-500" aria-hidden />
      {BLOCKED[result]}
    </span>
  );
