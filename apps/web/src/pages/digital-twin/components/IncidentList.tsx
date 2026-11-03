// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Tag } from "antd";

import { formatDate } from "../../../utils/format";
import type { Incident, Metric } from "../types";
import { formatDuration, formatNumber } from "../utils";
import { tr } from "../../../i18n";

export const IncidentList = ({
  incidents,
  metrics,
  onAcknowledge,
}: {
  incidents: Incident[];
  metrics: Metric[];
  onAcknowledge: (i: Incident) => void;
}) => {
  const label = (key: string) => metrics.find((m) => m.key === key)?.label ?? key;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card" aria-label={tr("Sự cố gần đây")}>
      <h3 className="text-[14px] font-semibold text-ink">{tr("Sự cố gần đây")}</h3>
      {incidents.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">{tr("Không có lần vượt ngưỡng nào trong 24 giờ qua.")}</p>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-col divide-y divide-line/70 p-0">
          {incidents.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-[12.5px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-ink">
                  <span className="font-mono text-[12px]">{i.code}</span>
                  <span className="font-medium">{label(i.attribute)}</span>
                  <Tag color={i.severity === "critical" ? "red" : "gold"}>
                    {i.severity === "critical" ? tr("Nghiêm trọng") : tr("Cảnh báo")}
                  </Tag>
                  {i.open && <Tag color="volcano">{tr("Đang diễn ra")}</Tag>}
                </div>
                <div className="text-muted">
                  {formatDate(i.startedAt)} · {i.side === "above" ? tr("vượt") : tr("dưới")} {tr(" ngưỡng ")}{" "}
                  {formatNumber(i.threshold)} {formatDuration(i.minutes)} {tr(" · đỉnh ")} {formatNumber(i.peak)}
                </div>
                {i.acknowledgedAt && (
                  <div className="text-bamboo-800">
                    {tr("Đã ghi nhận: ")} {i.acknowledgedBy} · {formatDate(i.acknowledgedAt)} — {i.ackNote}
                  </div>
                )}
              </div>
              {!i.acknowledgedAt && (
                <button
                  type="button"
                  onClick={() => onAcknowledge(i)}
                  className="shrink-0 text-[12.5px] font-semibold text-bamboo-700 hover:underline"
                >
                  {tr("Ghi nhận")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
