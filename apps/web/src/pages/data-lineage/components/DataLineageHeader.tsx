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

import { Segmented } from "antd";
import { RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import type { LineageOrigin } from "../api";
import { tr } from "../../../i18n";

export const DataLineageHeader = ({
  onReport,
  origin,
  onOriginChange,
  onRefresh,
  refreshing,
  live,
  hasDemo,
}: {
  onReport?: () => void;
  origin: LineageOrigin;
  onOriginChange: (o: LineageOrigin) => void;
  onRefresh: () => void;
  refreshing: boolean;
  live?: ReactNode;
  hasDemo: boolean;
}) => (
  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Phả hệ dữ liệu")}</h1>
      <p className="mt-1 text-[13px] text-muted">
        {origin === "auto"
          ? tr("Thu tự động từ hệ thống đang chạy: PostgreSQL → CDC → Lakehouse → lớp ngữ nghĩa → nơi dùng")
          : tr("Dữ liệu đến từ đâu, đi qua những bước nào và ảnh hưởng tới đâu · dữ liệu mẫu")}
      </p>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
      {live}
      {hasDemo && (
        <Segmented<LineageOrigin>
          value={origin}
          onChange={onOriginChange}
          options={[
            { value: "auto", label: tr("Hệ thống thật") },
            { value: "demo", label: tr("Dữ liệu mẫu") },
          ]}
        />
      )}
      {origin === "auto" && (
        <button type="button" onClick={onRefresh} disabled={refreshing} className={secondaryButtonClass}>
          <RefreshCw className={refreshing ? "h-4 w-4 motion-safe:animate-spin" : "h-4 w-4"} aria-hidden />
          {refreshing ? tr("Đang thu thập…") : tr("Thu thập và kiểm tra")}
        </button>
      )}
      {onReport && (
        <button type="button" onClick={onReport} className={primaryButtonClass}>
          <TriangleAlert className="h-4 w-4" aria-hidden />
          {tr("Báo sự cố dữ liệu")}
        </button>
      )}
    </div>
  </div>
);
