/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { Cpu, Gauge, Recycle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import type { LoadedModel } from "../types";
import { STATS_DAYS, gigabytes, num, type totals } from "../utils";
import { tr, trf } from "../../../i18n";

const Metric = ({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) => (
  <div className="flex min-w-0 items-start gap-3">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ui bg-bamboo-50 text-bamboo-700" aria-hidden>
      {icon}
    </span>
    <div className="min-w-0">
      <p className="m-0 truncate text-[12px] text-muted">{label}</p>
      <p className="m-0 text-[17px] font-semibold tabular-nums text-ink">{value}</p>
      <p className="m-0 truncate text-[11.5px] text-muted">{note}</p>
    </div>
  </div>
);

export const AiResourcePanel = ({
  kpi,
  loaded,
  aiEnabled,
}: {
  kpi: ReturnType<typeof totals>;
  loaded: LoadedModel[];
  aiEnabled: boolean;
}) => {
  const memory = loaded.reduce((s, m) => s + m.size, 0);
  const vram = loaded.reduce((s, m) => s + m.size_vram, 0);
  return (
    <section
      aria-label={tr("Tài nguyên và tốc độ")}
      className="grid gap-4 rounded-2xl border border-line bg-surface px-5 py-4 shadow-card lg:grid-cols-[1fr_minmax(260px,340px)]"
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric
          icon={<Gauge className="h-4 w-4" />}
          label={tr("Tốc độ sinh")}
          value={kpi.tokensPerSecond == null ? "—" : trf("{0} token/giây", [num(kpi.tokensPerSecond, 1)])}
          note={tr("Sau chữ đầu tiên")}
        />
        <Metric
          icon={<Cpu className="h-4 w-4" />}
          label={tr("Ngữ cảnh mỗi lượt")}
          value={kpi.contextTokens == null ? "—" : trf("{0} token", [num(kpi.contextTokens)])}
          note={tr("Prompt gửi mô hình, trung bình")}
        />
        <Metric
          icon={<Recycle className="h-4 w-4" />}
          label={trf("Dùng lại câu trả lời · {0} ngày", [STATS_DAYS])}
          value={num(kpi.reused)}
          note={
            kpi.answered
              ? trf("{0}% lượt trả lời không cần gọi mô hình", [num((kpi.reused / kpi.answered) * 100)])
              : tr("Chưa có lượt trả lời")
          }
        />
        <Metric
          icon={<RotateCcw className="h-4 w-4" />}
          label={tr("Lượt phải thử lại")}
          value={num(kpi.retried)}
          note={tr("Ollama tạm không phản hồi")}
        />
      </div>
      <div className="min-w-0 rounded-xl bg-black/[0.03] px-3.5 py-3">
        <p className="m-0 text-[12px] font-medium text-body">{tr("Đang nằm trong bộ nhớ")}</p>
        {!aiEnabled ? (
          <p className="m-0 mt-1 text-[12px] text-muted">{tr("Ollama không phản hồi.")}</p>
        ) : loaded.length === 0 ? (
          <p className="m-0 mt-1 text-[12px] text-muted">
            {tr("Không có mô hình nào: mô hình chỉ nạp khi có việc và tự gỡ khi nhàn rỗi.")}
          </p>
        ) : (
          <>
            <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
              {loaded.map((m) => (
                <li key={m.name} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="truncate font-mono text-ink">{m.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {gigabytes(m.size)}
                    {m.size_vram > 0 && ` · ${trf("{0}% GPU", [num((m.size_vram / Math.max(m.size, 1)) * 100)])}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-1.5 text-[11.5px] text-muted">
              {trf("Tổng {0}, trong đó VRAM {1}", [gigabytes(memory), gigabytes(vram)])}
            </p>
          </>
        )}
      </div>
    </section>
  );
};
