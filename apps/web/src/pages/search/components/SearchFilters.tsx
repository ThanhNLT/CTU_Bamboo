/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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
import { Lock } from "lucide-react";

import { COMPANY_LABEL, TYPE_LABEL } from "../labels";
import type { Company, ResultType, TimeRange } from "../types";
import { tr } from "../../../i18n";

const TYPES = Object.keys(TYPE_LABEL) as ResultType[];
const TIME_OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: "7d", label: tr("7 ngày qua") },
  { value: "30d", label: tr("30 ngày qua") },
  { value: "90d", label: tr("90 ngày qua") },
  { value: "all", label: tr("Mọi thời điểm") },
];

const GroupTitle = ({ children }: { children: string }) => (
  <h2 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
);

const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

const Option = ({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: (on: boolean) => void;
}) => (
  <Checkbox
    checked={checked}
    onChange={(e) => onChange(e.target.checked)}
    className="flex w-full items-center py-1 [&>span:last-child]:flex-1"
  >
    <span className="flex w-full items-center justify-between gap-2 text-[13px] text-ink">
      {label}
      <span className="tabular-nums text-[12px] text-muted">{count}</span>
    </span>
  </Checkbox>
);

export const SearchFilters = ({
  types,
  onTypesChange,
  companies,
  onCompaniesChange,
  permitted,
  range,
  onRangeChange,
  counts,
  hiddenCount,
  className,
}: {
  types: ResultType[];
  onTypesChange: (t: ResultType[]) => void;
  companies: Company[];
  onCompaniesChange: (c: Company[]) => void;
  permitted: Company[];
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
  counts: { types: Partial<Record<ResultType, number>>; companies: Partial<Record<Company, number>> };
  hiddenCount: number;
  className?: string;
}) => (
  <aside aria-label={tr("Bộ lọc")} className={className}>
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <section>
        <GroupTitle>{tr("Loại")}</GroupTitle>
        {TYPES.map((t) => (
          <Option
            key={t}
            label={TYPE_LABEL[t]}
            count={counts.types[t] ?? 0}
            checked={types.includes(t)}
            onChange={(on) => onTypesChange(toggle(types, t, on))}
          />
        ))}
      </section>

      {permitted.length > 1 && (
        <section className="mt-3 border-t border-line pt-3">
          <GroupTitle>{tr("Công ty")}</GroupTitle>
          {permitted.map((c) => (
            <Option
              key={c}
              label={COMPANY_LABEL[c]}
              count={counts.companies[c] ?? 0}
              checked={companies.includes(c)}
              onChange={(on) => onCompaniesChange(toggle(companies, c, on))}
            />
          ))}
        </section>
      )}

      <section className="mt-3 border-t border-line pt-3">
        <GroupTitle>{tr("Thời gian")}</GroupTitle>
        <Select<TimeRange>
          value={range}
          onChange={onRangeChange}
          options={TIME_OPTIONS}
          className="w-full"
          aria-label={tr("Khoảng thời gian")}
        />
      </section>

      {hiddenCount > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-canvas px-3 py-2.5 text-[12px] text-body">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          {hiddenCount} {tr(" kết quả bị ẩn vì nằm ngoài phạm vi quyền của bạn")}
        </p>
      )}
    </div>
  </aside>
);
