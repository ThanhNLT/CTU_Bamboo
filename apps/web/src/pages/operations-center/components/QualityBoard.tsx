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

import { Progress, Tag } from "antd";
import { Link } from "react-router";

import { useOpsTab, type QualityCheck } from "../api";
import { ChartWidget } from "./ChartWidget";
import { fmtNum } from "../boardFormat";
import { BoardState } from "./BoardParts";
import { tr, trf } from "../../../i18n";

const SEVERITY: Record<QualityCheck["severity"], { label: string; color: string }> = {
  critical: { label: tr("Nghiêm trọng"), color: "red" },
  warning: { label: tr("Cần sửa"), color: "gold" },
  info: { label: tr("Theo dõi"), color: "blue" },
};

export const QualityBoard = () => {
  const { data, error, loading } = useOpsTab("quality", 30);
  return (
    <BoardState loading={loading} error={error} ready={Boolean(data)}>
      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <ChartWidget title={tr("Điểm chất lượng")}>
            <div className="flex flex-col items-center gap-3 py-4">
              <Progress
                type="dashboard"
                percent={data.score}
                strokeColor={data.score >= 80 ? "#2f7a3e" : data.score >= 50 ? "#eda100" : "#dc2626"}
                format={(p) => `${p}%`}
              />
              <p className="m-0 text-center text-[12.5px] text-muted">
                {data.checks.filter((c) => c.count === 0).length}/{data.checks.length} {tr(" kiểm tra đạt")}
              </p>
            </div>
          </ChartWidget>
          <ChartWidget
            title={tr("Kiểm tra dữ liệu")}
            meta={data.admin ? tr("Kèm tên mẫu") : tr("Chỉ số lượng (tên mẫu dành cho người quản trị dữ liệu)")}
          >
            <ul className="m-0 flex list-none flex-col divide-y divide-line/70 p-0">
              {data.checks.map((c) => (
                <li key={c.key} className="flex flex-wrap items-start gap-3 py-2.5">
                  <span
                    className={
                      c.count
                        ? "mt-0.5 min-w-[44px] text-right text-[18px] font-semibold tabular-nums text-ink"
                        : "mt-0.5 min-w-[44px] text-right text-[18px] font-semibold tabular-nums text-bamboo-700"
                    }
                  >
                    {fmtNum(c.count)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
                      {c.label}
                      {c.count > 0 ? (
                        <Tag color={SEVERITY[c.severity].color}>{SEVERITY[c.severity].label}</Tag>
                      ) : (
                        <Tag color="green">{tr("Đạt")}</Tag>
                      )}
                    </div>
                    {c.samples.length > 0 && (
                      <p className="m-0 mt-0.5 truncate text-[12px] text-muted">
                        {c.samples.join(" · ")}
                        {c.count > c.samples.length ? trf(" · và {0} khác", [c.count - c.samples.length]) : ""}
                      </p>
                    )}
                  </div>
                  {c.count > 0 && (
                    <Link to={c.link} className="text-[12.5px] font-semibold text-bamboo-700 hover:underline">
                      {tr("Xử lý")}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </ChartWidget>
        </div>
      )}
    </BoardState>
  );
};
