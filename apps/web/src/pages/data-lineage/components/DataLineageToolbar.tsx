import { Checkbox, Select } from "antd";

import { SearchInput } from "../../../components/ui";
import { tr, trf } from "../../../i18n";

const DEPTH_OPTIONS = [1, 2, 3, 4, 5].map((d) => ({ value: d, label: trf("Độ sâu: {0}", [d]) }));

export const DataLineageToolbar = ({
  query,
  onQueryChange,
  onSubmitQuery,
  matchCount,
  depth,
  onDepthChange,
  columnMode,
  onColumnModeChange,
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
      <SearchInput
        value={query}
        onChange={onQueryChange}
        placeholder={tr("Tìm bảng, cột, báo cáo")}
        label={tr("Tìm bảng, cột, báo cáo trong sơ đồ")}
      />
    </form>
    <Select<number>
      value={depth}
      onChange={onDepthChange}
      options={DEPTH_OPTIONS}
      style={{ width: 128 }}
      size="large"
      aria-label={tr("Độ sâu phả hệ")}
    />
    <Checkbox checked={columnMode} onChange={(e) => onColumnModeChange(e.target.checked)}>
      <span className="text-[13px] text-body">{tr("Phả hệ mức cột")}</span>
    </Checkbox>
    {query.trim() && (
      <span className="text-[12.5px] text-muted" aria-live="polite">
        {matchCount > 0 ? trf("{0} nút khớp · Enter để chọn nút đầu tiên", [matchCount]) : tr("Không có nút nào khớp")}
      </span>
    )}
  </div>
);
