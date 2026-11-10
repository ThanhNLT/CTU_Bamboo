/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { DatePicker, Select } from "antd";
import dayjs from "dayjs";
import { Play } from "lucide-react";
import type { ReactNode } from "react";

import { smallPrimaryButtonClass } from "../../../components/ui/buttons";
import { cn } from "../../../utils/cn";
import { sourceOf, valueLabel } from "../chart";
import { CHART_TYPES } from "../chartTypes";
import type { Catalog, ChartSpec, ChartType } from "../types";
import { tr } from "../../../i18n";

const MAX_METRICS = 4;
const MAX_DIMENSIONS = 2;

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[12px] font-medium text-body">{label}</span>
    {children}
    {hint && <span className="text-[11.5px] text-muted">{hint}</span>}
  </div>
);

/** Bộ dựng biểu đồ: chọn nguồn, chỉ số, chu kỳ, chiều, khoảng ngày, bộ lọc và kiểu biểu đồ. */
export const ChartBuilder = ({
  catalog,
  spec,
  onChange,
  chartType,
  onChartType,
  values,
  onRun,
  running,
}: {
  catalog: Catalog;
  spec: ChartSpec;
  onChange: (spec: ChartSpec) => void;
  chartType: ChartType;
  onChartType: (t: ChartType) => void;
  /** Giá trị đã gặp của từng chiều (từ kết quả gần nhất), làm gợi ý cho bộ lọc. */
  values: Record<string, string[]>;
  onRun: () => void;
  running: boolean;
}) => {
  const source = sourceOf(catalog, spec.source);
  const set = (patch: Partial<ChartSpec>) => onChange({ ...spec, ...patch });
  const filterOf = (d: string) => spec.filters?.find((f) => f.dimension === d)?.values ?? [];
  const setFilter = (d: string, vals: string[]) =>
    set({
      filters: [
        ...(spec.filters ?? []).filter((f) => f.dimension !== d),
        ...(vals.length ? [{ dimension: d, values: vals.slice(0, 20) }] : []),
      ],
    });
  const pieNeedsOne =
    chartType === "pie" && (spec.metrics.length > 1 || spec.dimensions.length + (spec.time_grain ? 1 : 0) !== 1);

  return (
    <div className="flex flex-col gap-4">
      <Field label={tr("Nguồn dữ liệu")}>
        <Select
          value={spec.source}
          onChange={(name: string) => {
            const next = sourceOf(catalog, name);
            onChange({
              ...spec,
              source: name,
              metrics: next?.measures[0] ? [next.measures[0].name] : [],
              dimensions: [],
              filters: [],
            });
          }}
          options={catalog.sources.map((s) => ({ value: s.name, label: s.label }))}
          aria-label={tr("Nguồn dữ liệu")}
        />
      </Field>

      <Field label={tr("Chỉ số")} hint={tr("Tối đa 4 chỉ số cùng nguồn; chỉ số khác đơn vị nên vẽ riêng")}>
        <Select
          mode="multiple"
          value={spec.metrics}
          maxCount={MAX_METRICS}
          onChange={(metrics: string[]) => set({ metrics })}
          options={source?.measures.map((m) => ({ value: m.name, label: m.unit ? `${m.label} (${m.unit})` : m.label }))}
          aria-label={tr("Chỉ số")}
        />
      </Field>

      <Field label={tr("Theo thời gian")}>
        <Select
          value={spec.time_grain ?? ""}
          onChange={(g: string) => set({ time_grain: g || null })}
          options={[
            { value: "", label: tr("Không chia theo thời gian") },
            ...catalog.grains.map((g) => ({ value: g.name, label: g.label })),
          ]}
          aria-label={tr("Theo thời gian")}
        />
      </Field>

      <Field
        label={tr("Chia theo")}
        hint={tr("Tối đa 2 chiều; chiều thứ hai (hoặc chiều khi đã chia theo thời gian) thành các chuỗi màu")}
      >
        <Select
          mode="multiple"
          allowClear
          value={spec.dimensions}
          maxCount={MAX_DIMENSIONS}
          placeholder={tr("Không chia")}
          onChange={(dimensions: string[]) => set({ dimensions })}
          options={source?.dimensions.map((d) => ({ value: d.name, label: d.label }))}
          aria-label={tr("Chia theo")}
        />
      </Field>

      <Field label={tr("Khoảng thời gian")}>
        <DatePicker.RangePicker
          allowEmpty={[true, true]}
          format="DD/MM/YYYY"
          value={[spec.from ? dayjs(spec.from) : null, spec.to ? dayjs(spec.to) : null]}
          onChange={(r) =>
            set({ from: r?.[0]?.format("YYYY-MM-DD") ?? null, to: r?.[1]?.format("YYYY-MM-DD") ?? null })
          }
          presets={[
            { label: tr("30 ngày qua"), value: [dayjs().subtract(29, "day"), dayjs()] },
            {
              label: tr("Quý này"),
              value: [
                dayjs()
                  .startOf("month")
                  .subtract(dayjs().month() % 3, "month"),
                dayjs(),
              ],
            },
            { label: tr("Năm nay"), value: [dayjs().startOf("year"), dayjs()] },
          ]}
        />
      </Field>

      {source && source.dimensions.length > 0 && (
        <Field label={tr("Lọc")} hint={tr("Chọn giá trị gợi ý từ kết quả hoặc gõ mã rồi Enter")}>
          <div className="flex flex-col gap-2">
            {source.dimensions.map((d) => (
              <Select
                key={d.name}
                mode="tags"
                allowClear
                value={filterOf(d.name)}
                maxCount={20}
                placeholder={d.label}
                onChange={(vals: string[]) => setFilter(d.name, vals)}
                options={(values[d.name] ?? []).map((v) => ({ value: v, label: valueLabel(d.name, v) }))}
                aria-label={d.label}
              />
            ))}
          </div>
        </Field>
      )}

      <Field label={tr("Kiểu biểu đồ")}>
        <div role="radiogroup" aria-label={tr("Kiểu biểu đồ")} className="grid grid-cols-3 gap-1.5">
          {CHART_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={chartType === t.key}
              onClick={() => onChartType(t.key)}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11.5px] font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                chartType === t.key ? "bg-bamboo-100 text-bamboo-800" : "bg-canvas text-body hover:bg-bamboo-50",
              )}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
        {pieNeedsOne && (
          <span className="text-[11.5px] text-amber-700">
            {tr("Biểu đồ tròn dùng một chỉ số và đúng một cách chia (thời gian hoặc một chiều); phần còn lại bỏ qua.")}
          </span>
        )}
      </Field>

      <button
        type="button"
        onClick={onRun}
        disabled={running || !spec.metrics.length}
        className={cn(smallPrimaryButtonClass, "h-10 justify-center")}
      >
        <Play className="h-4 w-4" aria-hidden />
        {running ? tr("Đang truy vấn…") : tr("Vẽ biểu đồ")}
      </button>
    </div>
  );
};
