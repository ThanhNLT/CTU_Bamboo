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

import { Segmented, Select } from "antd";

import type { SortKey } from "../types";
import { tr } from "../../../i18n";

export type DriveView = "grid" | "list";

const VIEW_OPTIONS = [
  { label: tr("Lưới"), value: "grid" },
  { label: tr("Danh sách"), value: "list" },
];

const SORT_OPTIONS: Array<{ label: string; value: SortKey }> = [
  { label: tr("Mới cập nhật"), value: "updated" },
  { label: tr("Tên (A–Z)"), value: "name" },
  { label: tr("Dung lượng lớn nhất"), value: "size" },
];

export const DriveToolbar = ({
  path,
  onCrumb,
  view,
  onViewChange,
  sort,
  onSortChange,
}: {
  path: string[];
  onCrumb?: (index: number) => void;
  view: DriveView;
  onViewChange: (v: DriveView) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
}) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
    <nav aria-label={tr("Đường dẫn thư mục")} className="min-w-0 flex-1">
      <ol className="m-0 flex list-none items-center gap-1.5 p-0 text-[14px]">
        {path.map((part, i) => {
          const last = i === path.length - 1;
          return (
            <li key={`${part}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {last || !onCrumb ? (
                <span
                  className={last ? "truncate font-semibold text-ink" : "shrink-0 text-muted"}
                  aria-current={last ? "page" : undefined}
                >
                  {part}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onCrumb(i)}
                  className="shrink-0 text-muted hover:text-ink hover:underline underline-offset-2"
                >
                  {part}
                </button>
              )}
              {!last && (
                <span className="text-muted/70" aria-hidden>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>

    <div className="flex items-center gap-3">
      <Segmented options={VIEW_OPTIONS} value={view} onChange={(v) => onViewChange(v as DriveView)} />
      <label className="flex items-center gap-2 text-[12.5px] text-muted">
        {tr("Sắp xếp")}
        <Select<SortKey>
          value={sort}
          onChange={onSortChange}
          options={SORT_OPTIONS}
          variant="filled"
          popupMatchSelectWidth={false}
          style={{ minWidth: 150 }}
          aria-label={tr("Sắp xếp tệp")}
        />
      </label>
    </div>
  </div>
);
