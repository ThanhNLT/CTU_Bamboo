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

import { Checkbox, Select } from "antd";

import { SearchInput } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { DOC_KIND_LABEL } from "../../../api/documents";
import type { RecordFilters, RecordType, StatusTab, TimeRange } from "../types";
import { STATUS_TABS, TIME_OPTIONS } from "../utils";
import { tr } from "../../../i18n";

const TYPE_OPTIONS: Array<{ label: string; value: RecordType | "all" }> = [
  { label: tr("Tất cả loại hồ sơ"), value: "all" },
  ...(Object.entries(DOC_KIND_LABEL) as Array<[RecordType, string]>).map(([value, label]) => ({ value, label })),
];

const StatusTabs = ({
  value,
  counts,
  onChange,
}: {
  value: StatusTab;
  counts: Record<StatusTab, number>;
  onChange: (t: StatusTab) => void;
}) => (
  <div
    role="tablist"
    aria-label={tr("Trạng thái hồ sơ")}
    className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-black/[0.045] p-1"
  >
    {STATUS_TABS.map(({ key, label }) => {
      const active = key === value;
      return (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(key)}
          className={cn(
            "h-8 rounded-full px-3.5 text-[12.5px] transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
            active ? "bg-segment font-semibold text-ink shadow-card" : "text-body hover:text-ink",
          )}
        >
          {label} <span className={cn("tabular-nums", active ? "text-ink" : "text-muted")}>{counts[key]}</span>
        </button>
      );
    })}
  </div>
);

export const RecordsFilterBar = ({
  filters,
  counts,
  onChange,
}: {
  filters: RecordFilters;
  counts: Record<StatusTab, number>;
  onChange: (patch: Partial<RecordFilters>) => void;
}) => (
  <div className="flex flex-col gap-3">
    <StatusTabs value={filters.tab} counts={counts} onChange={(tab) => onChange({ tab })} />

    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <SearchInput
        className="w-full sm:w-[280px]"
        value={filters.query}
        onChange={(query) => onChange({ query })}
        placeholder={tr("Mã, tiêu đề, người nộp")}
        label={tr("Tìm hồ sơ theo mã, tiêu đề, người nộp")}
      />
      <label className="flex items-center gap-2 text-[12.5px] text-muted">
        {tr("Loại")}
        <Select<RecordType | "all">
          value={filters.type}
          onChange={(type) => onChange({ type })}
          options={TYPE_OPTIONS}
          style={{ width: 200 }}
          aria-label={tr("Loại hồ sơ")}
        />
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-muted">
        {tr("Thời gian")}
        <Select<TimeRange>
          value={filters.range}
          onChange={(range) => onChange({ range })}
          options={TIME_OPTIONS}
          style={{ width: 140 }}
          aria-label={tr("Khoảng thời gian")}
        />
      </label>
      <Checkbox checked={filters.mineOnly} onChange={(e) => onChange({ mineOnly: e.target.checked })}>
        <span className="text-[12.5px] text-body">{tr("Chỉ của tôi")}</span>
      </Checkbox>
    </div>
  </div>
);
