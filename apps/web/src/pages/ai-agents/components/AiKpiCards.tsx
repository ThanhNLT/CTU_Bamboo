/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

import type { ReactNode } from "react";

import { STATS_DAYS, num, seconds, type totals } from "../utils";
import { tr, trf } from "../../../i18n";

const Card = ({ label, value, note }: { label: string; value: string; note: ReactNode }) => (
  <div className="min-w-0 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card">
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
      label={tr("Tác tử hoạt động")}
      value={num(kpi.active)}
      note={kpi.inactive ? trf("{0} đang ngừng", [kpi.inactive]) : tr("Không có tác tử ngừng")}
    />
    <Card
      label={trf("Lượt hỏi · {0} ngày", [STATS_DAYS])}
      value={num(kpi.questions)}
      note={trf("{0} đã trả lời · {1} nạp lạnh", [num(kpi.answered), num(kpi.coldStarts)])}
    />
    <Card
      label={tr("Thời gian trả lời TB")}
      value={seconds(kpi.avg)}
      note={trf("p90 cao nhất {0} · chữ đầu {1}", [seconds(kpi.p90), seconds(kpi.firstToken)])}
    />
    <Card
      label={tr("Rào chắn đã chặn")}
      value={num(kpi.refused)}
      note={trf("{0} tiêm lệnh · {1} ngoài phạm vi", [num(kpi.prompt), num(kpi.refused - kpi.prompt)])}
    />
    <Card label={tr("Lỗi")} value={num(kpi.errors)} note={tr("Mô hình hoặc tìm kiếm không phản hồi")} />
  </dl>
);
