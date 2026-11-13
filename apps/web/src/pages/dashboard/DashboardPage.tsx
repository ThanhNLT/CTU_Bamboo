/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { Alert, App } from "antd";

import { useModules } from "../../modules/useModules";

import { DashboardFooter } from "./components/DashboardFooter";
import { HeroSection } from "./components/HeroSection";
import { MyTasks } from "./components/MyTasks";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { PinnedKpis } from "./components/PinnedKpis";
import { RecentRecords } from "./components/RecentRecords";
import { SummaryCards } from "./components/SummaryCards";
import { useKpis } from "./useKpis";
import { useDashboard } from "./useDashboard";
import { tr, trf } from "../../i18n";

export const DashboardPage = () => {
  const d = useDashboard();
  const { message } = App.useApp();
  const kpi = useKpis();
  const kpiOn = useModules().enabled("data");
  const saveKpis = async (keys: string[]) => {
    try {
      await kpi.save(keys);
      message.success(keys.length ? trf("Đã ghim {0} KPI", [keys.length]) : tr("Đã bỏ ghim mọi KPI"));
    } catch (e) {
      message.error((e as Error).message);
      throw e;
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <HeroSection user={d.user} />

      {d.error && <Alert type="error" showIcon message={tr("Không tải được một phần dữ liệu")} description={d.error} />}

      <SummaryCards stats={d.summary} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <MyTasks tasks={d.tasks} total={d.tasks.length} />
          <RecentRecords records={d.recent} />
        </div>

        <aside
          className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-1"
          aria-label={tr("Thông báo và chỉ số")}
        >
          <NotificationsPanel items={d.notifications} unread={d.unread} onRead={d.markRead} />
          {kpiOn && (
            <PinnedKpis kpis={kpi.pinned} options={kpi.options} pinnedKeys={kpi.pinnedKeys} onSave={saveKpis} />
          )}
        </aside>
      </div>

      <DashboardFooter />
    </div>
  );
};

export default DashboardPage;
