// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, App } from "antd";

import { DashboardFooter } from "./components/DashboardFooter";
import { HeroSection } from "./components/HeroSection";
import { MyTasks } from "./components/MyTasks";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { PinnedKpis } from "./components/PinnedKpis";
import { RecentRecords } from "./components/RecentRecords";
import { SummaryCards } from "./components/SummaryCards";
import { useKpis } from "./useKpis";
import { useDashboard } from "./useDashboard";

export const DashboardPage = () => {
  const d = useDashboard();
  const { message } = App.useApp();
  const kpi = useKpis();
  const saveKpis = async (keys: string[]) => {
    try {
      await kpi.save(keys);
      message.success(keys.length ? `Đã ghim ${keys.length} KPI` : "Đã bỏ ghim mọi KPI");
    } catch (e) {
      message.error((e as Error).message);
      throw e;
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <HeroSection user={d.user} />

      {d.error && <Alert type="error" showIcon message="Không tải được một phần dữ liệu" description={d.error} />}

      <SummaryCards stats={d.summary} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <MyTasks tasks={d.tasks} total={d.tasks.length} />
          <RecentRecords records={d.recent} />
        </div>

        <aside
          className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-1"
          aria-label="Thông báo và chỉ số"
        >
          <NotificationsPanel items={d.notifications} unread={d.unread} onRead={d.markRead} />
          <PinnedKpis kpis={kpi.pinned} options={kpi.options} pinnedKeys={kpi.pinnedKeys} onSave={saveKpis} />
        </aside>
      </div>

      <DashboardFooter />
    </div>
  );
};

export default DashboardPage;
