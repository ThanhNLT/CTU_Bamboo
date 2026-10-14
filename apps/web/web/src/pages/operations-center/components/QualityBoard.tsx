// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Bảng "Chất lượng dữ liệu": các kiểm tra trên tổ chức, danh mục, tệp và chỉ mục tìm kiếm của tenant; mỗi kiểm tra có
// số bản ghi vi phạm và chỗ sửa. Tên mẫu chỉ hiện cho người quản trị dữ liệu (Action ops_dashboard).

// ===== Thư viện =====
import { Progress, Tag } from "antd"; // Ant Design
import { Link } from "react-router"; // React Router

// ===== Module nội bộ =====
import { useOpsTab, type QualityCheck } from "../api";
import { ChartWidget } from "./ChartWidget";
import { fmtNum } from "../boardFormat";
import { BoardState } from "./BoardParts";

// ===== Hằng số =====
const SEVERITY: Record<QualityCheck["severity"], { label: string; color: string }> = {
  critical: { label: "Nghiêm trọng", color: "red" },
  warning: { label: "Cần sửa", color: "gold" },
  info: { label: "Theo dõi", color: "blue" },
};

// ===== Component =====
export const QualityBoard = () => {
  const { data, error, loading } = useOpsTab("quality", 30);
  return (
    <BoardState loading={loading} error={error} ready={Boolean(data)}>
      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <ChartWidget title="Điểm chất lượng">
            <div className="flex flex-col items-center gap-3 py-4">
              <Progress
                type="dashboard"
                percent={data.score}
                strokeColor={data.score >= 80 ? "#2f7a3e" : data.score >= 50 ? "#eda100" : "#dc2626"}
                format={(p) => `${p}%`}
              />
              <p className="m-0 text-center text-[12.5px] text-muted">
                {data.checks.filter((c) => c.count === 0).length}/{data.checks.length} kiểm tra đạt
              </p>
            </div>
          </ChartWidget>
          <ChartWidget
            title="Kiểm tra dữ liệu"
            meta={data.admin ? "Kèm tên mẫu" : "Chỉ số lượng (tên mẫu dành cho người quản trị dữ liệu)"}
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
                        <Tag color="green">Đạt</Tag>
                      )}
                    </div>
                    {c.samples.length > 0 && (
                      <p className="m-0 mt-0.5 truncate text-[12px] text-muted">
                        {c.samples.join(" · ")}
                        {c.count > c.samples.length ? ` · và ${c.count - c.samples.length} khác` : ""}
                      </p>
                    )}
                  </div>
                  {c.count > 0 && (
                    <Link to={c.link} className="text-[12.5px] font-semibold text-bamboo-700 hover:underline">
                      Xử lý
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
