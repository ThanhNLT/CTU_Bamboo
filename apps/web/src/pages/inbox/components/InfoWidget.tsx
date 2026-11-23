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

import type { ReactNode } from "react";
import { Link } from "react-router";

import type { TaskInfo } from "../types";
import { tr } from "../../../i18n";

export const InfoWidget = ({ info }: { info: TaskInfo }) => {
  const rows: Array<[string, ReactNode]> = [
    [tr("Người nộp"), info.submitter],
    [tr("Đơn vị"), info.unit],
  ];
  if (info.amount) rows.push([tr("Số tiền"), <span className="tabular-nums">{info.amount}</span>]);
  if (info.device) {
    rows.push([
      tr("Thiết bị"),
      <Link to={info.device.to} className="text-bamboo-700 hover:underline underline-offset-2">
        {info.device.label}
      </Link>,
    ]);
  }
  if (info.phone) rows.push([tr("Điện thoại"), <span className="tabular-nums">{info.phone}</span>]);
  if (info.dataTier) rows.push([tr("Dữ liệu"), info.dataTier]);
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card" aria-labelledby="inbox-info">
      <h3 id="inbox-info" className="text-[14px] font-semibold text-ink">
        {tr("Thông tin")}
      </h3>
      <dl className="m-0 mt-2.5 grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 min-w-0 truncate text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
