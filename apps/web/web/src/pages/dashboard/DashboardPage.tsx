// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Trang chủ (Con người số): lời chào, 4 thẻ thống kê, cột trái 70% (Việc của tôi, Hồ sơ gần đây),
// cột phải 30% (Thông báo, KPI đã ghim). Hiện dùng dữ liệu minh họa trong ./mock.
import { DashboardFooter } from "./components/DashboardFooter";
import { HeroSection } from "./components/HeroSection";
import { MyTasks } from "./components/MyTasks";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { PinnedKpis } from "./components/PinnedKpis";
import { RecentRecords } from "./components/RecentRecords";
import { SummaryCards } from "./components/SummaryCards";
import {
  MOCK_KPIS, MOCK_NOTIFICATIONS, MOCK_RECENT_RECORDS, MOCK_SUMMARY, MOCK_TASKS, MOCK_USER,
} from "./mock";

export const DashboardPage = () => (
  <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
    <HeroSection user={MOCK_USER} />

    <SummaryCards stats={MOCK_SUMMARY} />

    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <MyTasks tasks={MOCK_TASKS} total={MOCK_TASKS.length} />
        <RecentRecords records={MOCK_RECENT_RECORDS} />
      </div>

      <aside className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-1" aria-label="Thông báo và chỉ số">
        <NotificationsPanel items={MOCK_NOTIFICATIONS} />
        <PinnedKpis kpis={MOCK_KPIS} />
      </aside>
    </div>

    <DashboardFooter />
  </div>
);

export default DashboardPage;
