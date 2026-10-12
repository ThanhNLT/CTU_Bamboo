// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Trung tâm điều hành (Dữ liệu số): 5 KPI · 4 khối biểu đồ (2×2) · bảng quá hạn SLA.
// Tô sáng chéo: bấm thanh/chú giải/dòng của một công ty → cả trang làm nổi công ty đó; Esc để bỏ.
// Dữ liệu thật qua ./useOpsData (trong phạm vi tenant và quyền xem); riêng bản đồ cảnh báo thiết bị còn minh họa (./sample).
import { Alert } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { DailyApprovalsChart } from "./components/DailyApprovalsChart";
import { DashboardFilterBar } from "./components/DashboardFilterBar";
import { KpiCard } from "./components/KpiCard";
import { MonthlyApprovalsChart } from "./components/MonthlyApprovalsChart";
import { OpsHeader } from "./components/OpsHeader";
import { OverdueTable } from "./components/OverdueTable";
import { PendingByCompanyChart } from "./components/PendingByCompanyChart";
import { WarningMapWidget } from "./components/WarningMapWidget";
import { SITES } from "./sample";
import type { CompanyKey, DashTab, Period } from "./types";
import { useOpsData } from "./useOpsData";
import { SLA_HOURS } from "../inbox/useInboxTasks";

const PROVINCES = [...new Set(SITES.map((s) => s.province))];

export const OperationsCenterPage = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<DashTab>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const [province, setProvince] = useState("all");
  const [highlight, setHighlight] = useState<CompanyKey | undefined>();
  const ops = useOpsData(period);
  const meta = `Nóng · ${ops.updatedAt}`;
  const [presenting, setPresenting] = useState(false);

  // Esc bỏ tô sáng (khi không ở chế độ toàn màn hình — Esc lúc đó dành cho trình duyệt thoát trình chiếu).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) setHighlight(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onChange = () => setPresenting(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const togglePresent = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  const sites = useMemo(() => (province === "all" ? SITES : SITES.filter((s) => s.province === province)), [province]);

  return (
    <div
      ref={rootRef}
      className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 [&:fullscreen]:max-w-none [&:fullscreen]:overflow-auto [&:fullscreen]:bg-canvas [&:fullscreen]:p-8"
    >
      <OpsHeader presenting={presenting} onTogglePresent={togglePresent} />

      <DashboardFilterBar
        tab={tab}
        onTabChange={setTab}
        period={period}
        onPeriodChange={setPeriod}
        province={province}
        provinces={PROVINCES}
        onProvinceChange={setProvince}
        highlightLabel={highlight ? ops.company[highlight]?.name : undefined}
        onClearHighlight={() => setHighlight(undefined)}
        onClearAll={() => {
          setHighlight(undefined);
          setProvince("all");
        }}
      />

      {tab !== "overview" ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center text-[13px] text-muted">
          Bảng điều hành này sẽ có khi nối dịch vụ dữ liệu. Hiện chỉ có “Tổng quan”.
        </div>
      ) : (
        <>
          {ops.error && <Alert type="error" showIcon message="Không tải được một phần số liệu" description={ops.error} />}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {ops.kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DailyApprovalsChart
              data={ops.daily} companies={ops.companies} company={ops.company} meta={meta} rangeLabel={ops.rangeLabel}
              highlight={highlight} onHighlight={setHighlight}
            />
            <PendingByCompanyChart rows={ops.pending} company={ops.company} meta={meta} highlight={highlight} onHighlight={setHighlight} />
            <WarningMapWidget sites={sites} />
            <MonthlyApprovalsChart data={ops.monthly} year={dayjs().year()} meta={meta} />
          </div>

          <OverdueTable
            rows={ops.overdue} company={ops.company} highlight={highlight} onHighlight={setHighlight}
            definition={`5 hồ sơ có bước duyệt đang mở lâu hơn hạn ${SLA_HOURS} giờ nhất. Nguồn: wf.task đang mở, trong phạm vi bạn được xem.`}
          />
        </>
      )}
    </div>
  );
};

export default OperationsCenterPage;
