// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Checkbox, Modal, Tag } from "antd";
import { Pin } from "lucide-react";
import { useState } from "react";

import { cn } from "../../../utils/cn";
import { MAX_PINS, type KpiOption } from "../useKpis";
import type { PinnedKpi, Tone } from "../types";
import { Dot, Panel, PanelLink } from "../../../components/ui";
import { Sparkline } from "./Sparkline";
import { tr, trf } from "../../../i18n";

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
        {kpi.noteMarker === "down" && <span className="sr-only">{tr("Giảm ")} </span>}
        {kpi.noteMarker === "up" && <span className="sr-only">{tr("Tăng ")} </span>}
        {kpi.note}
      </span>
    </div>
    <Sparkline
      className="mt-3"
      data={kpi.series}
      threshold={kpi.threshold}
      label={trf("{0}: xu hướng 12 kỳ gần nhất, hiện tại {1}", [kpi.label, kpi.value])}
    />
  </div>
);

const PinPicker = ({
  open,
  options,
  initial,
  onCancel,
  onSave,
}: {
  open: boolean;
  options: KpiOption[];
  initial: string[];
  onCancel: () => void;
  onSave: (keys: string[]) => Promise<void>;
}) => {
  const [picked, setPicked] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const toggle = (key: string, on: boolean) =>
    setPicked((p) => (on ? (p.length < MAX_PINS ? [...p, key] : p) : p.filter((k) => k !== key)));
  return (
    <Modal
      open={open}
      title={tr("Chọn KPI ghim lên Trang chủ")}
      okText={tr("Lưu")}
      cancelText={tr("Hủy")}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={async () => {
        setSaving(true);
        try {
          await onSave(picked);
        } finally {
          setSaving(false);
        }
      }}
      destroyOnHidden
    >
      <p className="mb-3 text-[12.5px] text-muted">
        {tr("Tích theo thứ tự muốn hiện, tối đa ")} {MAX_PINS} KPI ({picked.length}/{MAX_PINS}).
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {options.map((o) => {
          const pos = picked.indexOf(o.key);
          return (
            <li key={o.key}>
              <Checkbox
                checked={pos >= 0}
                disabled={pos < 0 && picked.length >= MAX_PINS}
                onChange={(e) => toggle(o.key, e.target.checked)}
              >
                <span className="font-medium text-ink">{o.label}</span>
                {pos >= 0 && <Tag className="ml-2">#{pos + 1}</Tag>}
                <span className="block text-[12px] text-muted">{o.definition}</span>
              </Checkbox>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
};

export const PinnedKpis = ({
  kpis,
  options,
  pinnedKeys,
  onSave,
}: {
  kpis: PinnedKpi[];
  options: KpiOption[];
  pinnedKeys: string[];
  onSave: (keys: string[]) => Promise<void>;
}) => {
  const [picking, setPicking] = useState(false);
  return (
    <Panel
      title={tr("KPI đã ghim")}
      extra={
        <span className="inline-flex items-center gap-3">
          {options.length > 0 && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-bamboo-700 hover:underline"
            >
              <Pin className="h-3.5 w-3.5" aria-hidden />
              {tr("Chọn KPI")}
            </button>
          )}
          <PanelLink to="/d/ops">{tr("Điều hành")}</PanelLink>
        </span>
      }
    >
      {kpis.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">
          {options.length ? tr("Chưa ghim KPI nào. Bấm “Chọn KPI” để ghim.") : tr("Tenant chưa có KPI.")}
        </p>
      ) : (
        <div className="divide-y divide-line">
          {kpis.map((k) => (
            <KpiBlock key={k.key} kpi={k} />
          ))}
        </div>
      )}
      {picking && (
        <PinPicker
          open
          options={options}
          initial={pinnedKeys}
          onCancel={() => setPicking(false)}
          onSave={async (keys) => {
            await onSave(keys);
            setPicking(false);
          }}
        />
      )}
    </Panel>
  );
};
