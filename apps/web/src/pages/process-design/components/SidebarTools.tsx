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

import { FileText, Plus } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { ProcessSummary } from "../types";
import { tr, trf } from "../../../i18n";

const AUDIENCE_SHORT = { UNIT: tr("trong đơn vị"), COMPANY: tr("toàn công ty"), GROUP: tr("toàn tập đoàn") } as const;
const RUN_LABEL = { COMPLETED: tr("chạy thử đạt"), STOPPED: tr("chạy thử dừng"), FAILED: tr("chạy thử lỗi") } as const;

export const SidebarTools = ({
  processes,
  activeId,
  canCreate,
  onSelect,
  onCreate,
  onFromDocument,
}: {
  processes: ProcessSummary[];
  activeId?: string;
  canCreate: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onFromDocument?: () => void;
}) => (
  <nav
    aria-label={tr("Quy trình")}
    className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-card"
  >
    <ul className="m-0 list-none p-0">
      {processes.map((p) => {
        const active = p.id === activeId;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "block w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                active ? "bg-bamboo-50" : "hover:bg-canvas",
              )}
            >
              <span className="block truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                {p.publishedVersion ? trf("v{0} đã phát hành", [p.publishedVersion]) : tr("Chưa phát hành")}
                {p.access === "design" && p.lastRunStatus ? ` · ${RUN_LABEL[p.lastRunStatus]}` : ""}
              </span>
              {(p.ownerUnit || p.audience) && (
                <span className="block truncate text-[11.5px] text-muted">
                  {p.ownerUnit ?? tr("Toàn tập đoàn")}
                  {p.audience ? ` · ${AUDIENCE_SHORT[p.audience]}` : ""}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
    {processes.length === 0 && <p className="m-0 px-3 py-2 text-[12.5px] text-muted">{tr("Chưa có quy trình nào.")}</p>}
    {canCreate && (
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-bamboo-700 hover:bg-bamboo-50"
      >
        <Plus className="h-4 w-4" aria-hidden /> {tr(" Tạo quy trình")}
      </button>
    )}
    {canCreate && onFromDocument && (
      <button
        type="button"
        onClick={onFromDocument}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-bamboo-700 hover:bg-bamboo-50"
      >
        <FileText className="h-4 w-4" aria-hidden /> {tr(" Dựng từ văn bản")}
      </button>
    )}
  </nav>
);
