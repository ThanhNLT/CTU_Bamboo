import { Select } from "antd";
import { X } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { DashTab, Period } from "../types";
import { tr } from "../../../i18n";

const TABS: Array<{ key: DashTab; label: string }> = [
  { key: "overview", label: tr("Tổng quan") },
  { key: "process", label: tr("Quy trình") },
  { key: "production", label: tr("Sản xuất") },
  { key: "hospital", label: tr("Bệnh viện") },
  { key: "quality", label: tr("Chất lượng dữ liệu") },
];

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "week", label: tr("Tuần này") },
  { value: "month", label: tr("Tháng này") },
  { value: "quarter", label: tr("Quý này") },
];

export const DashboardFilterBar = ({
  tab,
  onTabChange,
  period,
  onPeriodChange,
  province,
  provinces,
  onProvinceChange,
  highlightLabel,
  onClearHighlight,
  onClearAll,
}: {
  tab: DashTab;
  onTabChange: (t: DashTab) => void;
  period: Period;
  onPeriodChange: (p: Period) => void;
  province: string;
  provinces: string[];
  onProvinceChange: (p: string) => void;
  highlightLabel?: string;
  onClearHighlight: () => void;
  onClearAll: () => void;
}) => {
  const hasActive = Boolean(highlightLabel) || province !== "all";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={tr("Bảng điều hành")}
          className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-black/[0.045] p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tab}
              onClick={() => onTabChange(t.key)}
              className={cn(
                "h-8 rounded-full px-3.5 text-[12.5px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                t.key === tab ? "bg-segment font-semibold text-ink shadow-card" : "text-body hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            {tr("Kỳ")}
            <Select<Period>
              value={period}
              onChange={onPeriodChange}
              options={PERIODS}
              style={{ width: 130 }}
              aria-label={tr("Kỳ")}
            />
          </label>
          {tab === "overview" && (
            <label className="flex items-center gap-2 text-[12.5px] text-muted">
              {tr("Cơ sở")}
              <Select<string>
                value={province}
                onChange={onProvinceChange}
                options={[{ value: "all", label: tr("Tất cả") }, ...provinces.map((p) => ({ value: p, label: p }))]}
                style={{ width: 150 }}
                aria-label={tr("Cơ sở")}
              />
            </label>
          )}
        </div>
      </div>

      {hasActive && (
        <div className="flex flex-wrap items-center gap-2" aria-label={tr("Bộ lọc đang bật")}>
          {highlightLabel && (
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-bamboo-200 bg-bamboo-50 pl-3 pr-1 text-[12px] font-medium text-bamboo-800">
              {tr("Đang tô sáng: ")} {highlightLabel}
              <button
                type="button"
                onClick={onClearHighlight}
                aria-label={tr("Bỏ tô sáng")}
                className="grid h-5 w-5 place-items-center rounded-ui hover:bg-bamboo-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {province !== "all" && (
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-[12px] font-medium text-ink">
              {tr("Cơ sở: ")} {province}
              <button
                type="button"
                onClick={() => onProvinceChange("all")}
                aria-label={tr("Bỏ lọc cơ sở")}
                className="grid h-5 w-5 place-items-center rounded-ui hover:bg-canvas"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={onClearAll}
            className="px-1 text-[12px] text-muted hover:text-ink hover:underline underline-offset-2"
          >
            {tr("Xóa tất cả")}
          </button>
        </div>
      )}
    </div>
  );
};
