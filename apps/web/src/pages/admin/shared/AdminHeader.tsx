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

import type { ReactNode } from "react";
import { tr } from "../../../i18n";

export const AdminHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
      <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
  </div>
);

export const NoAccess = ({ permission }: { permission: string }) => (
  <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
    <p className="text-[13.5px] font-medium text-ink">{tr("Bạn chưa có quyền quản trị mục này.")}</p>
    <p className="mt-1 text-[12.5px] text-muted">
      {tr("Cần quyền ")} <code className="rounded bg-canvas px-1 font-mono text-[12px]">{permission}</code>{" "}
      {tr(" — nhờ quản trị viên của tenant cấp vai trò cho vị trí của bạn.")}
    </p>
  </div>
);
