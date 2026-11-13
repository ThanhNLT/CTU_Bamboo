/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import { Alert, Segmented } from "antd";

import type { InboxScope } from "../types";
import { tr } from "../../../i18n";

export const InboxHeader = ({
  mineCount,
  teamCount,
  scope,
  onScopeChange,
  slaHours,
  error,
}: {
  mineCount: number;
  teamCount: number;
  scope: InboxScope;
  onScopeChange: (s: InboxScope) => void;
  slaHours: number;
  error?: string;
}) => (
  <>
    {error && <Alert type="error" showIcon message={tr("Không tải được hộp việc")} description={error} />}
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Hộp việc")}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {mineCount} {tr(" việc chờ bạn · sắp theo hạn SLA (")}
          {slaHours} {tr(" giờ từ lúc giao) · phím")}{" "}
          <kbd className="rounded border border-line bg-surface px-1 font-sans text-[11px]">J</kbd> /{" "}
          <kbd className="rounded border border-line bg-surface px-1 font-sans text-[11px]">K</kbd>{" "}
          {tr(" để chuyển việc")}
        </p>
      </div>
      <Segmented
        className="self-start sm:self-auto"
        value={scope}
        onChange={(v) => onScopeChange(v as InboxScope)}
        options={[
          {
            value: "mine",
            label: (
              <span>
                {tr("Của tôi ")} <span className="tabular-nums">{mineCount}</span>
              </span>
            ),
          },
          {
            value: "team",
            label: (
              <span>
                {tr("Cả nhóm ")} <span className="tabular-nums">{teamCount}</span>
              </span>
            ),
          },
        ]}
      />
    </div>
  </>
);
