/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import { Alert, App, Input, Spin } from "antd";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { acknowledgeIncident, useTwinEntities } from "./api";
import { CategoryTabs } from "./components/CategoryTabs";
import { EntityHeader } from "./components/EntityHeader";
import { EntityList } from "./components/EntityList";
import { IncidentList } from "./components/IncidentList";
import { MetricCard } from "./components/MetricCard";
import { SensorChart } from "./components/SensorChart";
import { TwinPageHeader } from "./components/TwinPageHeader";
import type { CategoryFilter, Incident, Metric, TimeRange } from "./types";
import { countByCategory, filterEntities, pickFromParams, sortEntities } from "./utils";
import { tr, trf } from "../../i18n";

const defaultMetric = (metrics: Metric[]) =>
  metrics.find((m) => m.status === "critical") ?? metrics.find((m) => m.status === "warning") ?? metrics[0];

export const DigitalTwinPage = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const twin = useTwinEntities();
  const sorted = useMemo(() => sortEntities(twin.entities), [twin.entities]);
  const counts = useMemo(() => countByCategory(twin.entities), [twin.entities]);
  const updatedAt = useMemo(
    () => Math.max(0, ...twin.entities.map((e) => (e.lastSeenAt ? Date.parse(e.lastSeenAt) : 0))) || twin.at,
    [twin.entities, twin.at],
  );

  const paramKey = `${params.get("entity") ?? ""}|${params.get("site") ?? ""}|${twin.entities.length > 0}`;
  const fromUrl = () => pickFromParams(twin.entities, params.get("entity"), params.get("site"));

  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<TimeRange>("1h");
  const [chartPick, setChartPick] = useState<{ entityId: string; key: string }>();

  const [seenParamKey, setSeenParamKey] = useState("");
  if (twin.entities.length > 0 && seenParamKey !== paramKey) {
    setSeenParamKey(paramKey);
    const hit = fromUrl();
    if (hit) {
      setCategory(hit.category);
      setSelectedId(hit.id);
      setQuery("");
    }
  }

  const visible = useMemo(() => filterEntities(sorted, category, query), [sorted, category, query]);
  const selected = visible.find((e) => e.id === selectedId) ?? visible[0];
  const chartMetric = selected
    ? (chartPick?.entityId === selected.id && selected.metrics.find((m) => m.key === chartPick.key)) ||
      defaultMetric(selected.metrics)
    : undefined;

  const pending = selected?.metrics.find((m) => m.incident)?.incident;

  const acknowledge = (i: Incident) => {
    let note = "";
    modal.confirm({
      title: trf("Ghi nhận sự cố {0}", [i.code]),
      content: (
        <Input.TextArea
          rows={3}
          aria-label={tr("Hướng xử lý")}
          placeholder={tr("Hướng xử lý (bắt buộc), ví dụ: đã kiểm tra bộ lọc HEPA, theo dõi thêm 30 phút")}
          onChange={(e) => (note = e.target.value)}
        />
      ),
      okText: tr("Ghi nhận"),
      cancelText: tr("Hủy"),
      onOk: async () => {
        if (!note.trim()) {
          message.error(tr("Ghi hướng xử lý trước khi ghi nhận"));
          throw new Error("missing note");
        }
        try {
          await acknowledgeIncident(i.id, note.trim());
          message.success(trf("Đã ghi nhận {0}", [i.code]));
          await twin.reload();
        } catch (e) {
          message.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  if (twin.loading && twin.entities.length === 0) return <Spin className="m-10" />;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <TwinPageHeader updatedAt={updatedAt} live={twin.live.connected} />
      {twin.error && (
        <Alert type="error" showIcon message={tr("Không tải được dữ liệu Bản sao số")} description={twin.error} />
      )}

      <CategoryTabs value={category} counts={counts} onChange={setCategory} />

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
            aria-label={trf("Chi tiết {0}", [selected.name])}
            className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1"
          >
            <EntityHeader
              entity={selected}
              pending={pending}
              onAsk={() => navigate(`/i/assistant?entity=${encodeURIComponent(selected.urn)}`)}
              onAcknowledge={acknowledge}
            />

            <div
              role="group"
              aria-label={tr("Chỉ số cảm biến — bấm một chỉ số để xem biểu đồ")}
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
            <IncidentList incidents={selected.incidents} metrics={selected.metrics} onAcknowledge={acknowledge} />
          </section>
        ) : (
          <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-line bg-surface text-[13px] text-muted shadow-card">
            {tr("Chọn một thực thể để xem dữ liệu cảm biến.")}
          </div>
        )}
      </div>
    </div>
  );
};

export default DigitalTwinPage;
