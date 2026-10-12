// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { Link } from "react-router";
import type { TaskInfo } from "../types";

/** Khối "Thông tin": cặp nhãn – giá trị. Thiết bị là liên kết sang Bản sao số. */
export const InfoWidget = ({ info }: { info: TaskInfo }) => {
  // Chỉ hiện dòng có dữ liệu (thiết bị, điện thoại, tầng dữ liệu chưa có ở mọi loại chứng từ).
  const rows: Array<[string, ReactNode]> = [
    ["Người nộp", info.submitter],
    ["Đơn vị", info.unit],
  ];
  if (info.amount) rows.push(["Số tiền", <span className="tabular-nums">{info.amount}</span>]);
  if (info.device) {
    rows.push(["Thiết bị", <Link to={info.device.to} className="text-bamboo-700 hover:underline underline-offset-2">{info.device.label}</Link>]);
  }
  if (info.phone) rows.push(["Điện thoại", <span className="tabular-nums">{info.phone}</span>]);
  if (info.dataTier) rows.push(["Dữ liệu", info.dataTier]);
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-card" aria-labelledby="inbox-info">
      <h3 id="inbox-info" className="text-[14px] font-semibold text-ink">Thông tin</h3>
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
