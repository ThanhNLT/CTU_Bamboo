// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Trung tâm điều hành (Dữ liệu số): 5 KPI · 4 khối biểu đồ (2×2) · bảng quá hạn SLA.
// Tô sáng chéo: bấm thanh/chú giải/dòng của một công ty → cả trang làm nổi công ty đó; Esc để bỏ.
// Dữ liệu minh họa ở ./mock (biểu đồ tháng mô phỏng một khối Metabase nhúng).
import { useEffect, useMemo, useRef, useState } from "react";
import { DailyApprovalsChart } from "./components/DailyApprovalsChart";
import { DashboardFilterBar } from "./components/DashboardFilterBar";
import { KpiCard } from "./components/KpiCard";
import { MonthlyApprovalsChart } from "./components/MonthlyApprovalsChart";
import { OpsHeader } from "./components/OpsHeader";
import { OverdueTable } from "./components/OverdueTable";
import { PendingByCompanyChart } from "./components/PendingByCompanyChart";
import { WarningMapWidget } from "./components/WarningMapWidget";
import { COMPANY, KPIS, OVERDUE, SITES } from "./mock";
import type { CompanyKey, DashTab, Period } from "./types";

const PROVINCES = [...new Set(SITES.map((s) => s.province))];

export const OperationsCenterPage = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<DashTab>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const [province, setProvince] = useState("all");
  // Bản thiết kế mở sẵn trạng thái tô sáng "Công ty Chip".
  const [highlight, setHighlight] = useState<CompanyKey | undefined>("chip");
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
        highlightLabel={highlight ? `Công ty ${COMPANY[highlight].short}` : undefined}
        onClearHighlight={() => setHighlight(undefined)}
        onClearAll={() => {
          setHighlight(undefined);
          setProvince("all");
        }}
      />

      {tab !== "overview" ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center text-[13px] text-muted">
          Bảng điều hành này sẽ có khi nối dịch vụ dữ liệu. Hiện chỉ có “Tổng quan” với dữ liệu minh họa.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {KPIS.map((k) => <KpiCard key={k.key} kpi={k} />)}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DailyApprovalsChart highlight={highlight} onHighlight={setHighlight} />
            <PendingByCompanyChart highlight={highlight} onHighlight={setHighlight} />
            <WarningMapWidget sites={sites} highlight={highlight} />
            <MonthlyApprovalsChart />
          </div>

          <OverdueTable rows={OVERDUE} highlight={highlight} onHighlight={setHighlight} />
        </>
      )}
    </div>
  );
};

export default OperationsCenterPage;
