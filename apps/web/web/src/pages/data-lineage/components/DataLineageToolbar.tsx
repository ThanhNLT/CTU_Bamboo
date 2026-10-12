// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Checkbox, Select } from "antd";
import { SearchInput } from "../../../components/ui";

const DEPTH_OPTIONS = [1, 2, 3, 4, 5].map((d) => ({ value: d, label: `Độ sâu: ${d}` }));

/** Tìm nút (Enter = chọn kết quả đầu), độ sâu phả hệ, bật/tắt phả hệ mức cột. */
export const DataLineageToolbar = ({
  query, onQueryChange, onSubmitQuery, matchCount, depth, onDepthChange, columnMode, onColumnModeChange,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmitQuery: () => void;
  matchCount: number;
  depth: number;
  onDepthChange: (d: number) => void;
  columnMode: boolean;
  onColumnModeChange: (on: boolean) => void;
}) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
    <form
      role="search"
      className="w-full sm:w-[300px]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmitQuery();
      }}
    >
      <SearchInput value={query} onChange={onQueryChange} placeholder="Tìm bảng, cột, báo cáo" label="Tìm bảng, cột, báo cáo trong sơ đồ" />
    </form>
    <Select<number>
      value={depth}
      onChange={onDepthChange}
      options={DEPTH_OPTIONS}
      style={{ width: 128 }}
      size="large"
      aria-label="Độ sâu phả hệ"
    />
    <Checkbox checked={columnMode} onChange={(e) => onColumnModeChange(e.target.checked)}>
      <span className="text-[13px] text-body">Phả hệ mức cột</span>
    </Checkbox>
    {query.trim() && (
      <span className="text-[12.5px] text-muted" aria-live="polite">
        {matchCount > 0 ? `${matchCount} nút khớp · Enter để chọn nút đầu tiên` : "Không có nút nào khớp"}
      </span>
    )}
  </div>
);
