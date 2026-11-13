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

import { Sparkles } from "lucide-react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { tr } from "../../../i18n";

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
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Thư viện tri thức")}</h1>
      <p className="mt-1 text-[13px] text-muted">
        {tr("Quy chế, quy trình chuẩn, hướng dẫn · đây cũng là nguồn tri thức của Trợ lý đa năng")}
      </p>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
      {canPropose && (
        <button type="button" onClick={onSuggest} className={secondaryButtonClass}>
          {tr("Đề xuất tài liệu")}
        </button>
      )}
      <button type="button" onClick={onAskLibrary} className={primaryButtonClass}>
        <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
        {tr("Hỏi trợ lý về thư viện")}
      </button>
    </div>
  </div>
);
