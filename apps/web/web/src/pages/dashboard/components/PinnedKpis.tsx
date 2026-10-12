// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { cn } from "../../../utils/cn";
import type { PinnedKpi, Tone } from "../types";
import { Dot, Panel, PanelLink } from "../../../components/ui";
import { Sparkline } from "./Sparkline";

const NOTE_TEXT: Record<Tone, string> = {
  success: "text-bamboo-700",
  warning: "text-amber-700",
  danger: "text-red-600",
  neutral: "text-muted",
};

const KpiBlock = ({ kpi }: { kpi: PinnedKpi }) => (
  <div className="py-4 first:pt-1 last:pb-0">
    <div className="text-[12px] text-muted">{kpi.label}</div>
    <div className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-ink">{kpi.value}</div>
    <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
      {kpi.noteMarker === "dot" ? (
        <Dot tone={kpi.noteTone} size="md" />
      ) : (
        <span className={cn("text-[10px]", NOTE_TEXT[kpi.noteTone])} aria-hidden>
          {kpi.noteMarker === "down" ? "▼" : "▲"}
        </span>
      )}
      <span>
        {kpi.noteMarker === "down" && <span className="sr-only">Giảm </span>}
        {kpi.noteMarker === "up" && <span className="sr-only">Tăng </span>}
        {kpi.note}
      </span>
    </div>
    <Sparkline
      className="mt-3"
      data={kpi.series}
      threshold={kpi.threshold}
      label={`${kpi.label}: xu hướng 12 kỳ gần nhất, hiện tại ${kpi.value}`}
    />
  </div>
);

export const PinnedKpis = ({ kpis }: { kpis: PinnedKpi[] }) => (
  <Panel title="KPI đã ghim" extra={<PanelLink to="/d/ops">Điều hành</PanelLink>}>
    <div className="divide-y divide-line">
      {kpis.map((k) => <KpiBlock key={k.key} kpi={k} />)}
    </div>
  </Panel>
);
