// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

import { STATS_DAYS, num, seconds, type totals } from "../utils";

const Card = ({ label, value, note }: { label: string; value: string; note: ReactNode }) => (
  <div className="min-w-0 rounded-2xl border border-line bg-white px-4 py-3.5 shadow-card">
    <dt className="truncate text-[12px] text-muted">{label}</dt>
    <dd className="m-0">
      <span className="mt-1 block text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-ink">
        {value}
      </span>
      <span className="mt-1 block truncate text-[11.5px] text-muted">{note}</span>
    </dd>
  </div>
);

export const AiKpiCards = ({ kpi }: { kpi: ReturnType<typeof totals> }) => (
  <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
    <Card
      label="Tác tử hoạt động"
      value={num(kpi.active)}
      note={kpi.inactive ? `${kpi.inactive} đang ngừng` : "Không có tác tử ngừng"}
    />
    <Card label={`Lượt hỏi · ${STATS_DAYS} ngày`} value={num(kpi.questions)} note={`${num(kpi.answered)} đã trả lời`} />
    <Card label="Thời gian trả lời TB" value={seconds(kpi.avg)} note={`p90 cao nhất ${seconds(kpi.p90)}`} />
    <Card
      label="Rào chắn đã chặn"
      value={num(kpi.refused)}
      note={`${num(kpi.prompt)} tiêm lệnh · ${num(kpi.refused - kpi.prompt)} ngoài phạm vi`}
    />
    <Card label="Lỗi" value={num(kpi.errors)} note="Mô hình hoặc tìm kiếm không phản hồi" />
  </dl>
);
