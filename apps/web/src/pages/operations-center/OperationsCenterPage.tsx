// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

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
import { HospitalBoard } from "./components/HospitalBoard";
import { ProcessBoard } from "./components/ProcessBoard";
import { ProductionBoard } from "./components/ProductionBoard";
import { QualityBoard } from "./components/QualityBoard";
import { SiteMapWidget } from "./components/SiteMapWidget";
import { useOpsTab } from "./api";
import type { CompanyKey, DashTab, Period } from "./types";
import { PERIOD_DAYS, useOpsData } from "./useOpsData";
import { SLA_HOURS } from "../inbox/useInboxTasks";
import { tr, trf } from "../../i18n";

export const OperationsCenterPage = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<DashTab>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const [province, setProvince] = useState("all");
  const [highlight, setHighlight] = useState<CompanyKey | undefined>();
  const ops = useOpsData(period);
  const meta = trf("Nóng · {0}", [ops.updatedAt]);
  const [presenting, setPresenting] = useState(false);

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

  const days = PERIOD_DAYS[period];
  const sitesQ = useOpsTab(tab === "overview" ? "sites" : null, days);
  const allSites = useMemo(() => sitesQ.data?.sites ?? [], [sitesQ.data]);
  const provinces = useMemo(
    () => [...new Set(allSites.map((s) => s.province).filter((p): p is string => Boolean(p)))].sort(),
    [allSites],
  );
  const sites = useMemo(
    () => (province === "all" ? allSites : allSites.filter((s) => s.province === province)),
    [allSites, province],
  );

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
        provinces={provinces}
        onProvinceChange={setProvince}
        highlightLabel={highlight ? ops.company[highlight]?.name : undefined}
        onClearHighlight={() => setHighlight(undefined)}
        onClearAll={() => {
          setHighlight(undefined);
          setProvince("all");
        }}
      />

      {tab === "process" && <ProcessBoard days={days} sla={SLA_HOURS} />}
      {tab === "production" && <ProductionBoard days={days} />}
      {tab === "hospital" && <HospitalBoard days={days} />}
      {tab === "quality" && <QualityBoard />}
      {tab === "overview" && (
        <>
          {ops.error && (
            <Alert type="error" showIcon message={tr("Không tải được một phần số liệu")} description={ops.error} />
          )}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {ops.kpis.map((k) => (
              <KpiCard key={k.key} kpi={k} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DailyApprovalsChart
              data={ops.daily}
              companies={ops.companies}
              company={ops.company}
              meta={meta}
              rangeLabel={ops.rangeLabel}
              highlight={highlight}
              onHighlight={setHighlight}
            />
            <PendingByCompanyChart
              rows={ops.pending}
              company={ops.company}
              meta={meta}
              highlight={highlight}
              onHighlight={setHighlight}
            />
            <SiteMapWidget sites={sites} loading={sitesQ.loading} />
            <MonthlyApprovalsChart data={ops.monthly} year={dayjs().year()} meta={meta} />
          </div>

          <OverdueTable
            rows={ops.overdue}
            company={ops.company}
            highlight={highlight}
            onHighlight={setHighlight}
            definition={trf(
              "5 hồ sơ có bước duyệt đang mở lâu hơn hạn {0} giờ nhất. Nguồn: wf.task đang mở, trong phạm vi bạn được xem.",
              [SLA_HOURS],
            )}
          />
        </>
      )}
    </div>
  );
};

export default OperationsCenterPage;
