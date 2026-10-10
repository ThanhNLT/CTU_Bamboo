// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Checkbox } from "antd";
import { Dot } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { LAYERS, layerCount } from "../mock";
import type { LayerKey, MapSite, SiteAlert } from "../types";

/** Lớp bản đồ: bật/tắt từng nhóm điểm, kèm số điểm. */
export const LayerFilterCard = ({
  layers, onToggle,
}: {
  layers: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey, on: boolean) => void;
}) => (
  <section className="rounded-2xl border border-line bg-white p-4 shadow-card" aria-labelledby="layers-title">
    <h2 id="layers-title" className="text-[14px] font-semibold text-ink">Lớp bản đồ</h2>
    <ul className="m-0 mt-3 list-none space-y-2.5 p-0">
      {LAYERS.map((l) => {
        const count = l.key === "boundary" ? null : layerCount(l.key);
        return (
          <li key={l.key} className="flex items-center justify-between gap-2">
            <Checkbox checked={layers[l.key]} onChange={(e) => onToggle(l.key, e.target.checked)}>
              <span className="text-[12.5px] text-ink">{l.label}</span>
            </Checkbox>
            {count != null && <span className="text-[11.5px] tabular-nums text-muted">{count}</span>}
          </li>
        );
      })}
    </ul>
  </section>
);

type AlertRow = SiteAlert & { site: MapSite };

/** Cảnh báo đang mở, nguy cấp trước; bấm để bay tới cơ sở trên bản đồ. */
export const AlertsCard = ({ sites, onFocus }: { sites: MapSite[]; onFocus: (site: MapSite) => void }) => {
  const rows: AlertRow[] = sites
    .flatMap((site) => site.alerts.map((a) => ({ ...a, site })))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "critical" ? -1 : 1));

  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-card" aria-labelledby="alerts-title">
      <h2 id="alerts-title" className="text-[14px] font-semibold text-ink">
        Cảnh báo đang mở
        <span className="sr-only">: {rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">Không có cảnh báo nào.</p>
      ) : (
        <ul className="m-0 mt-2 list-none p-0">
          {rows.map((a, i) => (
            <li key={`${a.site.id}-${a.code}`} className={cn(i > 0 && "border-t border-line/70")}>
              <button
                type="button"
                onClick={() => onFocus(a.site)}
                className="-mx-2 flex w-[calc(100%+16px)] items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-bamboo-500"
              >
                <Dot tone={a.status === "critical" ? "danger" : "warning"} size="md" className="mt-[5px]" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-snug text-ink">
                    {a.code} · {a.text}
                    <span className="sr-only"> ({a.status === "critical" ? "nguy cấp" : "cảnh báo"})</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                    {a.site.name} · {a.age}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/** Cột phải: lớp bản đồ + cảnh báo đang mở. */
export const MapSidebar = ({
  layers, onToggleLayer, sites, onFocusSite,
}: {
  layers: Record<LayerKey, boolean>;
  onToggleLayer: (key: LayerKey, on: boolean) => void;
  sites: MapSite[];
  onFocusSite: (site: MapSite) => void;
}) => (
  <aside className="flex min-w-0 flex-col gap-4" aria-label="Điều khiển bản đồ">
    <LayerFilterCard layers={layers} onToggle={onToggleLayer} />
    <AlertsCard sites={sites} onFocus={onFocusSite} />
  </aside>
);
