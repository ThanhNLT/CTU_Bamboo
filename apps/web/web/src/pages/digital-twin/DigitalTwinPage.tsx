// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Bản sao số (Dữ liệu số): master–detail. Trái ~30% danh sách thực thể NGSI-LD, phải ~70% chi tiết
// (thẻ đầu, lưới 6 chỉ số, biểu đồ lịch sử). Trên màn hình lớn hai cột cuộn độc lập.
// Mở thẳng một thực thể: /d/twin?entity=CR-02, hoặc từ Bản đồ: /d/twin?site=chip-bn. Dữ liệu minh họa ở ./mock.

// ===== Thư viện =====
import { App } from "antd"; // Ant Design
import { useMemo, useState } from "react"; // React
import { useNavigate, useSearchParams } from "react-router"; // React Router

// ===== Module nội bộ =====
import { CategoryTabs } from "./components/CategoryTabs";
import { EntityHeader } from "./components/EntityHeader";
import { EntityList } from "./components/EntityList";
import { MetricCard } from "./components/MetricCard";
import { SensorChart } from "./components/SensorChart";
import { TwinPageHeader } from "./components/TwinPageHeader";
import { useLiveClock } from "./hooks";
import { DEFAULT_CATEGORY, DEFAULT_ENTITY_ID, MOCK_ENTITIES } from "./mock";
import { MOCK_NOW } from "./signal";
import type { CategoryFilter, Metric, TimeRange } from "./types";
import { countByCategory, filterEntities, pickFromParams, sortEntities } from "./utils";

// ===== Hằng số =====
const SORTED = sortEntities(MOCK_ENTITIES);
const COUNTS = countByCategory(MOCK_ENTITIES);

// ===== Hàm tiện ích =====
/** Chỉ số vẽ mặc định: chỉ số nặng nhất (Nguy cấp → Cảnh báo), không có thì chỉ số đầu tiên. */
const defaultMetric = (metrics: Metric[]) =>
  metrics.find((m) => m.status === "critical") ?? metrics.find((m) => m.status === "warning") ?? metrics[0];

// ===== Component =====
export const DigitalTwinPage = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const updatedAt = useLiveClock(MOCK_NOW + 7_000);

  const paramKey = `${params.get("entity") ?? ""}|${params.get("site") ?? ""}`;
  const fromUrl = () => pickFromParams(MOCK_ENTITIES, params.get("entity"), params.get("site"));

  const [category, setCategory] = useState<CategoryFilter>(() => fromUrl()?.category ?? DEFAULT_CATEGORY);
  const [selectedId, setSelectedId] = useState<string>(() => fromUrl()?.id ?? DEFAULT_ENTITY_ID);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<TimeRange>("1h");
  const [chartPick, setChartPick] = useState<{ entityId: string; key: string }>();
  const [incidents, setIncidents] = useState<Record<string, string>>({});

  // Đang ở trang mà URL đổi (vd. bấm "Bản sao số" trên Bản đồ lần nữa) → chọn lại theo URL.
  const [seenParamKey, setSeenParamKey] = useState(paramKey);
  if (seenParamKey !== paramKey) {
    setSeenParamKey(paramKey);
    const hit = fromUrl();
    if (hit) {
      setCategory(hit.category);
      setSelectedId(hit.id);
      setQuery("");
    }
  }

  const visible = useMemo(() => filterEntities(SORTED, category, query), [category, query]);
  // Thực thể đang chọn bị lọc mất thì chọn thực thể đầu tiên còn hiển thị.
  const selected = visible.find((e) => e.id === selectedId) ?? visible[0];
  const chartMetric = selected
    ? (chartPick?.entityId === selected.id && selected.metrics.find((m) => m.key === chartPick.key)) ||
      defaultMetric(selected.metrics)
    : undefined;

  const createIncident = () => {
    if (!selected) return;
    const code = `HS-SC-2026-${String(42 + Object.keys(incidents).length).padStart(5, "0")}`;
    setIncidents((prev) => ({ ...prev, [selected.id]: code }));
    message.success(`Đã tạo ${code} cho ${selected.id} · đính kèm dữ liệu cảm biến 1 giờ qua.`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <TwinPageHeader updatedAt={updatedAt} />

      <CategoryTabs value={category} counts={COUNTS} onChange={setCategory} />

      <div className="grid grid-cols-1 gap-5 lg:h-[calc(100dvh-250px)] lg:min-h-[520px] lg:grid-cols-[minmax(240px,3fr)_minmax(0,7fr)]">
        <EntityList
          className="max-h-[420px] lg:max-h-none"
          entities={visible}
          selectedId={selected?.id}
          query={query}
          showKind={category === "all"}
          onQueryChange={setQuery}
          onSelect={setSelectedId}
        />

        {selected && chartMetric ? (
          <section
            aria-label={`Chi tiết ${selected.name}`}
            className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1"
          >
            <EntityHeader
              entity={selected}
              incidentCode={incidents[selected.id]}
              onAsk={() => navigate(`/i/assistant?entity=${encodeURIComponent(selected.urn)}`)}
              onCreateIncident={createIncident}
            />

            <div
              role="group"
              aria-label="Chỉ số cảm biến — bấm một chỉ số để xem biểu đồ"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {selected.metrics.map((m) => (
                <MetricCard
                  key={m.key}
                  metric={m}
                  selected={m.key === chartMetric.key}
                  onSelect={() => setChartPick({ entityId: selected.id, key: m.key })}
                />
              ))}
            </div>

            <SensorChart entity={selected} metric={chartMetric} range={range} onRangeChange={setRange} />
          </section>
        ) : (
          <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-line bg-white text-[13px] text-muted shadow-card">
            Chọn một thực thể để xem dữ liệu cảm biến.
          </div>
        )}
      </div>
    </div>
  );
};

export default DigitalTwinPage;
